import diff_match_patch = require('diff-match-patch');

// Same type as patch_make's result, which is what patch_apply accepts in @types/diff-match-patch.
type Patches = ReturnType<diff_match_patch['patch_make']>;

const dmp = new diff_match_patch();

export class InvalidPatchError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidPatchError';
	}
}

// Joplin stores text patches as JSON (the output of patch_make, e.g.
// `[{"diffs":[[1,"abc"]],"start1":0,...}]`, or `[]` for no change).
// The older `@@ -1,3 +1,3 @@` text format is accepted too.
export function parseTextPatch(patchText: string): Patches {
	if (!patchText) return [];
	if (patchText.startsWith('@@')) {
		try {
			return dmp.patch_fromText(patchText);
		} catch (error) {
			throw new InvalidPatchError(`Invalid text patch: ${String(error && error.message ? error.message : error)}`);
		}
	}
	let parsed: any;
	try {
		parsed = JSON.parse(patchText);
	} catch (error) {
		throw new InvalidPatchError(`Invalid JSON patch: ${patchText.slice(0, 40)}`);
	}
	if (!Array.isArray(parsed)) throw new InvalidPatchError(`Unexpected patch format: ${patchText.slice(0, 40)}`);
	// patch_apply deep-copies the patches into real patch_obj instances,
	// so plain objects parsed from JSON can be passed as they are.
	return parsed;
}

export interface PatchResult {
	text: string;
	// False when at least one hunk could not be applied cleanly.
	ok: boolean;
}

export function applyTextPatch(text: string, patchText: string): PatchResult {
	const patches = parseTextPatch(patchText);
	if (!patches.length) return { text, ok: true };
	const [patched, flags] = dmp.patch_apply(patches, text);
	return { text: patched, ok: flags.every(Boolean) };
}

// Builds a patch in the same format Joplin stores. Used by tests and the dev benchmark.
export function makeTextPatch(before: string, after: string): string {
	return JSON.stringify(dmp.patch_make(before, after));
}
