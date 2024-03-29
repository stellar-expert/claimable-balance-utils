import {StrKey} from '@stellar/stellar-base'

function xdrParseAccountAddress(accountId) {
    if (!accountId)
        return undefined
    if (StrKey.isValidEd25519PublicKey(accountId))
        return accountId
    if (accountId.arm) {
        switch (accountId.arm()) {
            case 'ed25519':
                accountId = accountId.ed25519()
                break
            case 'med25519':
                //accountId.value().id()
                accountId = accountId.value().ed25519()
                break
            default:
                throw new Error(`Unsupported muxed account type: ${accountId.arm()}`)
        }
    }
    return StrKey.encodeEd25519PublicKey(accountId)
}

function wrapCondition(condition, level) {
    if (level === 0)
        return condition
    return '(' + condition + ')'
}

function xdrParseClaimantPredicate(predicate, level, negate = false) {
    if (!predicate) return {}
    const type = predicate.switch().name
    const value = predicate.value()
    switch (type) {
        case 'claimPredicateUnconditional':
            return 'unconditional'
        case 'claimPredicateAnd':
            return wrapCondition(value.map(p => xdrParseClaimantPredicate(p, level + 1)).join(' and '), level)
        case 'claimPredicateOr':
            return wrapCondition(value.map(p => xdrParseClaimantPredicate(p, level + 1)).join(' or '), level)
        case 'claimPredicateNot':
            if (['claimPredicateBeforeAbsoluteTime', 'claimPredicateBeforeRelativeTime'].includes(value.switch().name)) {
                return xdrParseClaimantPredicate(value, level + 1, true)
            }
            return 'not ' + xdrParseClaimantPredicate(value, level + 1)
        case 'claimPredicateBeforeAbsoluteTime':
            return (negate ? 'after ' : 'before ') + formatAbsoluteTime(value)
        case 'claimPredicateBeforeRelativeTime':
            return (negate ? 'after ' : 'before ') + formatTimespan(value) + ' from now'
        default:
            throw new Error(`Unknown claim condition predicate: ${type}`)
    }
}

function formatTimespan(seconds, precision = 0) {
    let scaled = secondsToNumber(seconds)
    let currentUnit

    for (let [span, unit] of [[60, 'second'], [60, 'minute'], [24, 'hour'], [364, 'day'], [10000, 'year']]) {
        currentUnit = unit
        if (scaled < span) {
            scaled = scaled.toFixed(precision).replace(/.?0+$/, '')
            return `${scaled} ${currentUnit + (scaled > 1 ? 's' : '')}`
        }
        scaled /= span
    }
    return '∞'
}

function formatAbsoluteTime(seconds) {
    return new Date(secondsToNumber(seconds) * 1000).toISOString()
        .replace(/\.\d+Z$/, '')
        .replace('T', ' ')
}

function secondsToNumber(seconds) {
    if (!seconds)
        return seconds
    if (seconds.toNumber)
        return seconds.toNumber()
    return Number(seconds._value)
}

/**
 * Parse claimable balance condition and return formatted human-friendly predicate
 * @param {Claimant} claimant - Claimant condition with destination and predicate
 * @return {{predicate: String, destination: String}}
 */
export function xdrParseClaimant(claimant) {
    return {
        destination: xdrParseAccountAddress(claimant.destination),
        predicate: wrapCondition(xdrParseClaimantPredicate(claimant.predicate, 0))
    }
}