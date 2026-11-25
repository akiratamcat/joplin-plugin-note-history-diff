import { RevisionCache } from '../../src/history/revisionCache';

const v = (body: string) => ({ title: '', body });

describe('RevisionCache', () => {
	test('stores and returns values, tracking the total characters', () => {
		const cache = new RevisionCache(100);
		cache.set('a', v('12345'));
		cache.set('b', { title: 'tt', body: '123' });
		expect(cache.get('a')).toEqual(v('12345'));
		expect(cache.totalChars).toBe(10);
		expect(cache.size).toBe(2);
	});

	test('evicts the least recently used values when over the limit', () => {
		const cache = new RevisionCache(10);
		cache.set('a', v('aaaa'));
		cache.set('b', v('bbbb'));
		cache.get('a'); // "a" becomes the most recently used
		cache.set('c', v('cccc'));
		expect(cache.has('a')).toBe(true);
		expect(cache.has('b')).toBe(false);
		expect(cache.has('c')).toBe(true);
		expect(cache.totalChars).toBe(8);
	});

	test('replacing a key updates the total instead of adding to it', () => {
		const cache = new RevisionCache(100);
		cache.set('a', v('12345'));
		cache.set('a', v('12'));
		expect(cache.totalChars).toBe(2);
		expect(cache.size).toBe(1);
	});

	test('does not cache a value larger than the whole budget', () => {
		const cache = new RevisionCache(3);
		cache.set('big', v('12345'));
		expect(cache.has('big')).toBe(false);
		expect(cache.totalChars).toBe(0);
	});

	test('clear and delete', () => {
		const cache = new RevisionCache(100);
		cache.set('a', v('12'));
		cache.set('b', v('34'));
		cache.delete('a');
		expect(cache.totalChars).toBe(2);
		cache.clear();
		expect(cache.size).toBe(0);
		expect(cache.totalChars).toBe(0);
	});
});
