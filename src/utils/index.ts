export function normalize(rate: number): number {
    return Math.floor(rate * 1000) / 1000;
}

export function isEqual(rate1: number, rate2: number): boolean {
    return Math.floor(rate1 * 1000) === Math.floor(rate2 * 1000);
}
