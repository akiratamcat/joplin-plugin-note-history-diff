import { NoteVersion } from './types';

// Least-recently-used cache of rebuilt note versions, bounded by the total
// number of characters held. Holding every version of a large note is not an
// option (100 revisions of a 17,000-line note is ~40 million characters).
export class RevisionCache {
	private entries = new Map<string, NoteVersion>();
	private chars = 0;

	constructor(private readonly maxChars: number) {}

	public get totalChars(): number {
		return this.chars;
	}

	public get size(): number {
		return this.entries.size;
	}

	public has(key: string): boolean {
		return this.entries.has(key);
	}

	public get(key: string): NoteVersion | undefined {
		const value = this.entries.get(key);
		if (value === undefined) return undefined;
		// Re-insert to mark as most recently used (Map keeps insertion order).
		this.entries.delete(key);
		this.entries.set(key, value);
		return value;
	}

	public set(key: string, value: NoteVersion): void {
		this.delete(key);
		const size = sizeOf(value);
		// A single value larger than the whole budget is not cached.
		if (size > this.maxChars) return;
		this.entries.set(key, value);
		this.chars += size;
		this.evict();
	}

	public delete(key: string): void {
		const value = this.entries.get(key);
		if (value === undefined) return;
		this.entries.delete(key);
		this.chars -= sizeOf(value);
	}

	public clear(): void {
		this.entries.clear();
		this.chars = 0;
	}

	private evict(): void {
		while (this.chars > this.maxChars && this.entries.size) {
			const oldest = this.entries.keys().next().value as string;
			this.delete(oldest);
		}
	}
}

function sizeOf(value: NoteVersion): number {
	return value.title.length + value.body.length;
}
