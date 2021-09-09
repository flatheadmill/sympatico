[![Actions Status](https://github.com/bigeasy/sympatico/workflows/Node%20CI/badge.svg)](https://github.com/bigeasy/sympatico/actions)
[![codecov](https://codecov.io/gh/bigeasy/sympatico/branch/master/graph/badge.svg)](https://codecov.io/gh/bigeasy/sympatico)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An atomic log with a parititioned consensus algorithm.

| What          | Where                                         |
| --- | --- |
| Discussion    | https://github.com/bigeasy/sympatico/issues/1 |
| Documentation | https://bigeasy.github.io/sympatico           |
| Source        | https://github.com/bigeasy/sympatico          |
| Issues        | https://github.com/bigeasy/sympatico/issues   |
| CI            | https://travis-ci.org/bigeasy/sympatico       |
| Coverage:     | https://codecov.io/gh/bigeasy/sympatico       |
| License:      | MIT                                           |

Sympatico installs from NPM.

```text
//{ "mode": "text" }
npm install sympatico
```

This `README.md` is also a unit test using the
[Proof](https://github.com/bigeasy/proof) unit test framework. We'll use the
Proof `okay` function to assert out statements in the readme. A Proof unit test
generally looks like this.

```javascript
//{ "code": { "tests": 1 }, "text": { "tests": 4  } }
require('proof')(%(tests)d, async okay => {
    //{ "include": "test", "mode": "code" }
    //{ "include": "proof", "mode": "text" }
})
```

```javascript
//{ "name": "proof", "mode": "text" }
okay('always okay')
okay(true, 'okay if true')
okay(1, 1, 'okay if equal')
okay({ value: 1 }, { value: 1 }, 'okay if deep strict equal')
```

You can run this unit test yourself to see the output from the various
code sections of the readme.

```text
//{ "name": "run", "mode": "text" }
git clone git@github.com:bigeasy/packet.git
cd packet
npm install --no-package-lock --no-save
node --allow-natives-syntax test/readme/readme.t.js
```

## Further Documentation

```javascript
//{ "name": "test", "code": { "path": ".." }, "text": { "path": "packet"  } }
const Sympatico = require('%(path)s/phaser')
okay(Sympatico, 'require')
```
