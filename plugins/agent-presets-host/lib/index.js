/**
 * Declare every preset directory under the DSH home to the agent-preset registry.
 *
 * Why this exists: from @deepseek-ai/dsh-agent-preset-registry 0.1.7 on, the
 * harness no longer discovers presets on disk. A directory holding
 * `preset.yml` + `agent.cordis.yml` is inert until something calls
 * `ctx.agentPresets.register(...)` with its rows — which is exactly what
 * `@linxin666/dsh-liangshen` and the Workshop's preset center do for their own
 * presets. The tavern plugin (dsh-tavern) still WRITES presets into
 * `$DSH_HOME/.agent-presets/<id>/`, but its panel lists them from disk itself,
 * so a preset created there never reaches the session preset picker.
 *
 * This plugin closes that gap without copying any composition: it reads the
 * same directory the tavern edits, so a preset edited in the tavern panel is
 * what the next session composes. Single source of truth, no drift.
 *
 * Scope and limits, stated plainly so nothing is guessed at:
 *   - The preset ID is the directory name. IDs the harness rejects are skipped
 *     with a warning rather than renamed (a rename would break the session
 *     bindings that point at the original id).
 *   - A directory without both files, or whose composition is outside the
 *     supported YAML subset, is skipped with its reason logged; the remaining
 *     presets are still declared.
 *   - v0.2.0: after the activation pass the plugin WATCHES the library root
 *     (fs.watch, recursive) and resyncs incrementally on change, so a preset
 *     created in the tavern panel appears in the session picker within about
 *     a second — no restart. The resync declares new directories, releases
 *     directories that disappeared, and redeclares a directory whose
 *     `agent.cordis.yml` / `preset.yml` changed (edits made in the tavern
 *     panel reach the next NEW session; a session already running keeps its
 *     mounted generation — the registry retires generations by reference
 *     count, so a redeclaration never pulls the rug from under a live chat).
 *   - ids declared by ANOTHER plugin are left alone on every pass, not just
 *     the first one. A plugin that starts declaring a new id while DSH runs
 *     may draw one duplicate-declaration warning from a resync pass before
 *     this plugin's foreign set learns about it; the registry refuses the
 *     duplicate and nothing is harmed.
 *   - The watcher is best effort: if the platform or the filesystem refuses
 *     `fs.watch` (or the library root is absent at boot), the plugin logs one
 *     warning and falls back to the v0.1.0 semantics — a restart re-reads
 *     the directory. Nothing here is persisted into any profile file.
 *
 * @module dsh-agent-presets-host
 */

import { existsSync, readdirSync, readFileSync, statSync, watch } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import z from '@deepseek-ai/schemastery';
import { readCompositionRows, readPresetMetadata } from './yaml.js';

/** Plugin identity the loader keys this row by. */
const name = 'agent-presets-host';

/**
 * A preset is an ordinary registry declaration, so the service is the only
 * dependency. It is reached through `ctx.inject` rather than a hard `inject`
 * array: a deployment that composes no registry must still boot, and the
 * declaration has to wait for the service anyway.
 */
const inject = ['agentPresets'];

/** Preset id rule the harness enforces, mirrored so a bad id fails loudly here. */
const PRESET_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/** The composition file that makes a directory a preset. */
const COMPOSITION_FILE = 'agent.cordis.yml';

/** The display-text file beside it. */
const METADATA_FILE = 'preset.yml';

/**
 * The plugin config schema.
 *
 * This must be a REAL schema, not a plain defaults object: Cordis validates a
 * row's config through `Config["~standard"].validate(config)`, so a plain
 * object makes activation fail with
 * `Cannot read properties of undefined (reading 'validate')` — the plugin never
 * mounts and the failure is easy to miss. The defaults live in the schema, so a
 * row that carries no `config:` at all still activates with them applied.
 */
const Config = z.object({
	presetDir: z.string().default(''),
	announce: z.boolean().default(true),
	watch: z.boolean().default(true)
});

/** How many times one activation looks for the registry before giving up. */
const REGISTRY_ATTEMPTS = 20;

/** Wait between those looks: 20 × 500 ms ≈ 10 s of patience, off the boot path. */
const REGISTRY_RETRY_MS = 500;

/**
 * Grace period before a filesystem change triggers a resync pass.
 *
 * The tavern saves a preset as several files (agent.cordis.yml, preset.yml,
 * characters.json, worldbooks.json, the library-wide presets.json) inside a
 * few milliseconds. One debounce timer coalesces that burst into a single
 * pass, and the pass only reads two tiny YAML files per candidate id, so the
 * fan-in of events from a multi-megabyte worldbook write costs nothing.
 */
const RESYNC_DEBOUNCE_MS = 800;

/**
 * Wait, without pulling a timer API into the module's imports.
 * @param {number} ms - Milliseconds to wait.
 * @returns {Promise<void>} Resolves after the delay.
 */
function delay(ms) {
	return new Promise((resolveDelay) => {
		setTimeout(resolveDelay, ms);
	});
}

/**
 * Resolve the DSH home the way the loader does: the environment variable the
 * harness exports, else `~/.dsh`.
 * @returns {string} Absolute DSH home path.
 */
function dshHome() {
	const fromEnv = process.env.DSH_HOME;
	if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv;
	const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
	return join(home, '.dsh');
}

/**
 * The preset library the tavern writes and this plugin reads.
 * @param {Config} config - resolved plugin config.
 * @returns {string} Absolute preset library path.
 */
function libraryRoot(config) {
	const configured = typeof config?.presetDir === 'string' ? config.presetDir.trim() : '';
	if (configured !== '') return configured;
	return join(dshHome(), '.agent-presets');
}

/**
 * Subdirectory names of the preset library, sorted; an absent root yields none.
 * @param {string} root - Absolute preset library path.
 * @returns {string[]} Candidate preset ids.
 */
function scanPresetIds(root) {
	let entries;
	try {
		entries = readdirSync(root, { withFileTypes: true });
	} catch {
		return [];
	}
	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

/**
 * Read the display text of one preset directory.
 * @param {string} dir - Absolute preset directory.
 * @returns {{ name?: string, description?: string, order?: number }} Display text.
 */
function presetMetadata(dir) {
	return readPresetMetadata(readFileSync(join(dir, METADATA_FILE), 'utf8'));
}

/**
 * Read one preset directory as the registry definition it declares.
 *
 * Mirrors `@linxin666/dsh-liangshen`'s `readPresetDefinition`, minus the
 * settings overlay that plugin applies to its own rows.
 *
 * @param {string} id - Preset id (the directory name).
 * @param {string} dir - Absolute preset directory.
 * @returns {{ id: string, name?: string, description?: string, order?: number, plugins: object[] }} Definition.
 * @throws {Error} When a file is unreadable or the composition is unsupported.
 */
function readPresetDefinition(id, dir) {
	return {
		id,
		...presetMetadata(dir),
		plugins: readCompositionRows(readFileSync(join(dir, COMPOSITION_FILE), 'utf8'), dir)
	};
}

/**
 * Declare one preset, keeping its disposer.
 * @param {object} registry - The `agentPresets` service.
 * @param {Map<string, () => Promise<void>>} declared - Live declarations by id.
 * @param {string} id - Preset id.
 * @param {string} dir - Absolute preset directory.
 * @returns {Promise<string|undefined>} A warning line, or undefined on success.
 */
async function declareOne(registry, declared, id, dir) {
	if (!PRESET_ID_RE.test(id)) {
		return `skipped "${id}": not a usable preset id (the harness accepts ${String(PRESET_ID_RE)}); ` +
			'rename the directory and re-bind sessions to it if you want it declared';
	}
	if (!existsSync(join(dir, METADATA_FILE)) || !existsSync(join(dir, COMPOSITION_FILE))) {
		return `skipped "${id}": needs both ${METADATA_FILE} and ${COMPOSITION_FILE}`;
	}
	let definition;
	try {
		definition = readPresetDefinition(id, dir);
	} catch (error) {
		return `skipped "${id}": ${error instanceof Error ? error.message : String(error)}`;
	}
	try {
		const dispose = await registry.register(definition);
		declared.set(id, typeof dispose === 'function' ? dispose : async () => {});
		return undefined;
	} catch (error) {
		return `skipped "${id}": the registry refused the declaration: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/**
 * Declare every preset in the library, then release them when this row unloads.
 *
 * The declarations are per-process, so the effect is reversible: unloading the
 * plugin (or restarting DSH) drops them, and a restart re-reads the directory.
 *
 * @param {object} ctx - Host plugin context.
 * @param {import('@deepseek-ai/schemastery').Infer<typeof Config>} config - Config with schema defaults applied.
 */
function apply(ctx, config) {
	// Cordis hands the config through `Config["~standard"].validate`, so the
	// schema defaults are always present; the fallback only covers a host that
	// mounts this plugin without going through that path (e.g. a direct
	// `ctx.plugin()` in a test).
	const resolved = {
		presetDir: typeof config?.presetDir === 'string' ? config.presetDir : '',
		announce: config?.announce !== false
	};
	let closed = false;
	/** @type {Map<string, () => Promise<void>>} */
	const declared = new Map();
	/** Last-seen mtimes of the two tracked files per declared id. */
	const mtimes = new Map();
	/** Ids another plugin already declares — resync passes never touch these. */
	const foreignIds = new Set();
	/** The library watcher, when the platform granted one. */
	let watcher = null;
	let watcherBroken = false;
	let resyncTimer = null;
	/** Serializes resync passes; a burst of events collapses into back-to-back passes. */
	let syncChain = Promise.resolve();

	const warn = (message) => {
		try {
			ctx.logger?.warn?.(`${name}: ${message}`);
		} catch {}
		console.warn(`${name}: ${message}`);
	};
	const info = (message) => {
		try {
			ctx.logger?.info?.(`${name}: ${message}`);
		} catch {}
		if (resolved.announce !== false) console.log(`${name}: ${message}`);
	};

	const declareAll = async () => {
		const registry = ctx.get('agentPresets');
		if (registry === undefined) {
			warn('the agent-preset registry is unavailable; no preset was declared');
			return;
		}		// Presets another plugin already declares are left to it: the registry
		// refuses a duplicate id, and two owners for one id would fight over
		// which composition a session composes. `liangshen` is the live example
		// (its directory exists here AND @linxin666/dsh-liangshen declares it).
		const occupied = new Set();
		try {
			const roster = await registry.list();
			for (const row of Array.isArray(roster) ? roster : []) {
				if (typeof row?.id === 'string') occupied.add(row.id);
			}
		} catch (error) {
			warn(`reading the preset roster failed: ${error instanceof Error ? error.message : String(error)}`);
		}
		const root = libraryRoot(resolved);
		if (!existsSync(root)) {
			warn(`no preset library at ${root}; nothing to declare`);
			return;
		}
		let isDir = false;
		try {
			isDir = statSync(root).isDirectory();
		} catch {}
		if (!isDir) {
			warn(`preset library is not a directory: ${root}`);
			return;
		}
		const ids = scanPresetIds(root);
		if (ids.length === 0) {
			info(`no preset directories under ${root}`);
			return;
		}
		let ok = 0;
		let foreign = 0;
		for (const id of ids) {
			if (closed) return;
			if (declared.has(id)) continue;
			if (occupied.has(id)) {
				foreign += 1;
				foreignIds.add(id);
				info(`"${id}" is already declared by another plugin; left alone`);
				continue;
			}
			const warning = await declareOne(registry, declared, id, join(root, id));
			if (warning === undefined) {
				ok += 1;
				mtimes.set(id, readMtimes(join(root, id)));
				info(`declared preset "${id}"`);
			} else if (!warning.startsWith(`skipped "${id}": needs both`)) {
				warn(warning);
			}
		}
		info(`${String(ok)}/${String(ids.length)} preset(s) declared from ${root}` +
			(foreign > 0 ? ` (${String(foreign)} left to their own plugin)` : ''));
	};

	/**
	 * Current mtimes of the two tracked files in one preset directory.
	 * A missing file reads as -1, which can never equal a real timestamp, so
	 * "file vanished" is naturally seen as a change by {@link sameMtimes}.
	 * @param {string} dir - Absolute preset directory.
	 * @returns {{agent: number, meta: number}} mtime epoch-ms per file.
	 */
	function readMtimes(dir) {
		const out = { agent: -1, meta: -1 };
		try { out.agent = statSync(join(dir, COMPOSITION_FILE)).mtimeMs; } catch {}
		try { out.meta = statSync(join(dir, METADATA_FILE)).mtimeMs; } catch {}
		return out;
	}

	/**
	 * Whether the two tracked files are byte-for-byte the same files as when
	 * the id was declared (same mtime within a millisecond of slack).
	 * @param {{agent: number, meta: number}} a - Recorded mtimes.
	 * @param {{agent: number, meta: number}} b - Current mtimes.
	 * @returns {boolean} True when nothing changed.
	 */
	function sameMtimes(a, b) {
		return Math.abs(a.agent - b.agent) < 1 && Math.abs(a.meta - b.meta) < 1;
	}

	/**
	 * Release one declaration this plugin owns, dropping its mtime record.
	 * @param {string} id - Preset id.
	 * @returns {Promise<void>} Resolves once the disposer settled (or failed logged).
	 */
	const disposeOne = async (id) => {
		const dispose = declared.get(id);
		if (dispose === undefined) return;
		declared.delete(id);
		mtimes.delete(id);
		try {
			await dispose();
			info(`released "${id}"`);
		} catch (error) {
			warn(`releasing "${id}" failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	/**
	 * One INCREMENTAL pass over the library: declare what is new, release what
	 * is gone, redeclare what changed. Ids owned by another plugin and ids
	 * already declared with unchanged mtimes are skipped, so a pass triggered
	 * by a worldbook rewrite costs one readdir plus a couple of stat calls.
	 *
	 * Safe to run at any moment after activation: the registry refuses a
	 * duplicate id, a redeclaration retires the old generation by reference
	 * count (a running session keeps its mount; the next session composes the
	 * fresh files), and every failure degrades to a log line.
	 * @returns {Promise<void>} Resolves when the pass settled.
	 */
	const syncPass = async () => {
		if (closed) return;
		const registry = ctx.get('agentPresets');
		if (registry === undefined) return;
		const root = libraryRoot(resolved);
		const ids = scanPresetIds(root);
		const present = new Set(ids);
		for (const id of [...declared.keys()]) {
			if (closed) return;
			if (!present.has(id)) await disposeOne(id);
		}
		for (const id of ids) {
			if (closed) return;
			if (foreignIds.has(id)) continue;
			const dir = join(root, id);
			const now = readMtimes(dir);
			const prev = mtimes.get(id);
			if (prev !== undefined) {
				// declared.has(id) ⟺ mtimes.has(id): a failed declaration
				// leaves neither map touched, so this pair is exact.
				if (sameMtimes(prev, now)) continue;
				await disposeOne(id);
			}
			const warning = await declareOne(registry, declared, id, dir);
			if (warning === undefined) {
				mtimes.set(id, readMtimes(dir));
				info(`declared preset "${id}" (resync)`);
			} else {
				// Record the failed state as a sentinel: an unsupported id or
				// composition must not re-warn on every pass, while a burst
				// mid-write (the "needs both" case) resolves itself — the
				// tavern's final write changes an mtime, which invalidates the
				// sentinel and the next pass retries.
				mtimes.set(id, now);
				if (!warning.startsWith(`skipped "${id}": needs both`)) warn(warning);
			}
		}
	};

	/**
	 * Coalesce watcher events into one debounced, serialized resync pass.
	 * The timer is unref'd so it never keeps a dying process alive on its own.
	 * @returns {void} Nothing; the pass reports its own failures.
	 */
	const scheduleResync = () => {
		if (closed || watcherBroken) return;
		if (resyncTimer !== null) clearTimeout(resyncTimer);
		resyncTimer = setTimeout(() => {
			resyncTimer = null;
			syncChain = syncChain.then(syncPass, syncPass).catch((error) => {
				warn(`resync pass failed: ${error instanceof Error ? error.message : String(error)}`);
			});
		}, RESYNC_DEBOUNCE_MS);
		if (typeof resyncTimer.unref === 'function') resyncTimer.unref();
	};

	/**
	 * Watch the library root, any change reschedules a resync pass.
	 *
	 * `recursive: true` is supported on Windows and macOS, which covers this
	 * deployment; elsewhere the watch call itself throws and the plugin keeps
	 * the v0.1.0 restart semantics with one warning. Events are consumed
	 * blind (filename ignored): a pass is cheap, and Windows occasionally
	 * delivers a null filename for renames.
	 * @returns {void} Nothing; failures degrade to log lines.
	 */
	const startWatcher = () => {
		if (closed || resolved.watch === false || watcherBroken) return;
		const root = libraryRoot(resolved);
		try {
			watcher = watch(root, { recursive: true }, scheduleResync);
		} catch (error) {
			watcherBroken = true;
			warn(`watching ${root} is unavailable (${error instanceof Error ? error.message : String(error)}); ` +
				'presets created while DSH runs need a restart to appear');
			return;
		}
		if (watcher !== null && typeof watcher.on === 'function') {
			watcher.on('error', (error) => {
				if (watcherBroken) return;
				watcherBroken = true;
				try { watcher?.close(); } catch {}
				watcher = null;
				warn(`library watcher failed (${error instanceof Error ? error.message : String(error)}); ` +
					'presets created while DSH runs need a restart to appear');
			});
			info(`watching ${root} for preset changes`);
		}
	};

	/**
	 * Run one declaration pass, retrying briefly while the registry is absent.
	 *
	 * The registry is reached through `ctx.get` rather than awaited: a deployment
	 * composing no registry must still boot (awaiting a service that never
	 * appears pends this row, and a pending row fails the whole web boot rather
	 * than just this plugin). The bounded retry covers the opposite ordering —
	 * the registry publishing just after this row — without paying that boot
	 * cost: the wait happens inside this plugin's own async task, and giving up
	 * is logged rather than silent.
	 *
	 * This is deliberately a SEPARATE async task rather than something `apply`
	 * returns: the loader reads a plugin's return value as plugin exports, so
	 * returning this promise made activation fail with
	 * `Cannot read properties of undefined (reading 'validate')`.
	 * @returns {void} Nothing; the pass reports its own failures.
	 */
	const startPass = () => {
		runPass().catch((error) => {
			warn(`declaration pass failed: ${error instanceof Error ? error.message : String(error)}`);
		});
	};

	/** One pass, with every failure turned into a log line rather than a throw. */
	const runPass = async () => {
		try {
			for (let attempt = 1; attempt <= REGISTRY_ATTEMPTS; attempt += 1) {
				if (closed) return;
				if (ctx.get('agentPresets') !== undefined) break;
				if (attempt === REGISTRY_ATTEMPTS) {
					warn(`the agent-preset registry did not appear after ${String(REGISTRY_ATTEMPTS)} attempts; no preset was declared`);
					return;
				}
				await delay(REGISTRY_RETRY_MS);
			}
			await declareAll();
			// The watcher starts only once the library is confirmed present, so
			// an absent root cannot fail the watch call; a root created later
			// falls back to the restart semantics with a log line already
			// emitted by declareAll.
			if (existsSync(libraryRoot(resolved))) startWatcher();
		} catch (error) {
			warn(`declaration pass failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	/**
	 * Declare on activation and release on unload.
	 *
	 * `apply` itself stays synchronous: it returns nothing, like every other
	 * harness plugin. The async pass runs beside activation.
	 *
	 * Declarations are per-process: nothing is written to any profile file, so a
	 * restart re-reads the preset library and a preset edited in the tavern panel
	 * is picked up on the next start.
	 */
	ctx.effect(() => {
		startPass();
		return async () => {
			closed = true;
			if (resyncTimer !== null) {
				clearTimeout(resyncTimer);
				resyncTimer = null;
			}
			if (watcher !== null) {
				try { watcher.close(); } catch {}
				watcher = null;
			}
			for (const [id, dispose] of declared) {
				try {
					await dispose();
				} catch (error) {
					warn(`releasing "${id}" failed: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
			declared.clear();
			mtimes.clear();
		};
	}, `${name}: declare every preset under the DSH preset library`);
}

export { Config, COMPOSITION_FILE, METADATA_FILE, PRESET_ID_RE, apply, dshHome, inject, libraryRoot, name, readPresetDefinition, scanPresetIds };
