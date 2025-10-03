class JsUnpacker {
    static Unbase = class {
        constructor(radix) {
            this.ALPHABET_62 =
                '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
            this.ALPHABET_95 =
                ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
            this.alphabet = null;
            this.dictionary = {};
            this.radix = radix;

            if (radix > 36) {
                if (radix < 62) {
                    this.alphabet = this.ALPHABET_62.substring(0, radix);
                } else if (radix > 62 && radix < 95) {
                    this.alphabet = this.ALPHABET_95.substring(0, radix);
                } else if (radix === 62) {
                    this.alphabet = this.ALPHABET_62;
                } else if (radix === 95) {
                    this.alphabet = this.ALPHABET_95;
                }

                for (let i = 0; i < this.alphabet.length; i++) {
                    this.dictionary[this.alphabet[i]] = i;
                }
            }
        }

        unbase(str) {
            let ret = 0;

            if (this.alphabet === null) {
                ret = parseInt(str, this.radix);
            } else {
                const tmp = str.split('').reverse().join('');
                for (let i = 0; i < tmp.length; i++) {
                    ret += Math.pow(this.radix, i) * this.dictionary[tmp[i]];
                }
            }
            return ret;
        }
    };

    constructor(packedJS) {
        this.packedJS = packedJS;
    }

    detect() {
        const js = this.packedJS.replace(/\s/g, '');
        const regex = /eval\(function\(p,a,c,k,e,(?:r|d)/;
        return regex.test(js);
    }

    unpack() {
        let js = this.packedJS;
        try {
            const regex =
                /}\s*\('(.*)',\s*(.*?),\s*(\d+),\s*'(.*?)'\.split\('\|'\)/s;
            const match = js.match(regex);
            if (match && match.length === 5) {
                let payload = match[1].replace(/\\'/g, "'");
                const radixStr = match[2];
                const countStr = match[3];
                const symtab = match[4].split('|');

                let radix = 36;
                let count = 0;
                try {
                    radix = parseInt(radixStr);
                } catch {
                        // Ignore URL parsing errors
                    }
                try {
                    count = parseInt(countStr);
                } catch {
                        // Ignore URL parsing errors
                    }

                if (symtab.length !== count) {
                    throw new Error('Unknown p.a.c.k.e.r. encoding');
                }

                const unbase = new this.constructor.Unbase(radix);
                const wordRegex = /\b\w+\b/g;
                let decoded = payload;
                let replaceOffset = 0;
                let wordMatch;

                while ((wordMatch = wordRegex.exec(payload)) !== null) {
                    const word = wordMatch[0];
                    const x = unbase.unbase(word);
                    let value = null;
                    if (x < symtab.length) {
                        value = symtab[x];
                    }

                    if (value && value.length > 0) {
                        const start = wordMatch.index + replaceOffset;
                        const end = start + word.length;
                        decoded =
                            decoded.substring(0, start) +
                            value +
                            decoded.substring(end);
                        replaceOffset += value.length - word.length;
                    }
                }
                return decoded;
            }
        } catch (e) {
            return null;
        }
        return null;
    }
}

// CommonJS exports
module.exports = JsUnpacker;
