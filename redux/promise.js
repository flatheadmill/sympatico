class Promise {
    constructor (id, Date = Date) {
        this.id = id
        this._Date = Date
    }

    static compare (left, right) {
        const compare = (left[0] > right[0]) - (left[0] < right[0])
        if (compare == 0) {
            return (left[1] > right[1]) - (left[1] < right[1])
        }
        return compare
    }

    create () {
        return [ this._Date.now(), this.id ]
    }
}

module.exports = Promise
