// Red-black tree for ordered maps.
const { RBTree } = require('bintrees')

module.exports = function (instances, buckets) {
    buckets = buckets.slice()
    const counted = []
    for (let i = 0; i < instances; i++) {
        counted[i] = 0
    }
    for (const index of buckets) {
        counted[index]++
    }
    const load = new RBTree((left, right) => {
        const compare = counted[left] - counted[right]
        if (compare == 0) {
            return left - right
        }
        return compare
    })
    for (let i = 0; i < instances; i++) {
        load.insert(i)
    }
    const evenedOut = buckets.length % instances == 0 ? 0 : 1
    for (;;) {
        const max = load.max()
        const min = load.min()
        if (counted[max] - counted[min] == evenedOut) {
            break
        }
        load.remove(max)
        load.remove(min)
        counted[min]++
        counted[max]--
        buckets[buckets.indexOf(max)] = min
        load.insert(max)
        load.insert(min)
    }
    return buckets
}
