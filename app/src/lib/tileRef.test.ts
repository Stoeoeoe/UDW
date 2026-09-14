import { describe, expect, it } from 'vitest';
import {
    createTileRef,
    encodeTileRef,
    parseTileRef,
} from './tileRef';

describe('tile reference parsing', () => {
    it('round-trips a reference whose tileset ID contains colons', () => {
        const reference = createTileRef('world:village', 42);

        expect(parseTileRef(reference)).toEqual({
            tilesetId: 'world:village',
            tileIndex: 42,
        });
    });

    it.each(['', 'missing-index:', ':5', 'tileset:-1', 'tileset:1abc'])(
        'rejects malformed reference %j',
        (reference) => {
            expect(parseTileRef(reference)).toBeNull();
        },
    );

    it('uses the same parser when encoding references', () => {
        expect(() => encodeTileRef('tileset:1abc', ['tileset'])).toThrow(
            'Invalid tile reference format',
        );
    });
});
