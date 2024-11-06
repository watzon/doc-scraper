export function asRegExp(pattern: string | RegExp): RegExp {
    return pattern instanceof RegExp ? pattern : new RegExp(pattern);
}