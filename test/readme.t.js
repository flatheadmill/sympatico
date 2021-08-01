// [![Actions Status](https://github.com/bigeasy/sympatico/workflows/Node%20CI/badge.svg)](https://github.com/bigeasy/sympatico/actions)
// [![codecov](https://codecov.io/gh/bigeasy/sympatico/branch/master/graph/badge.svg)](https://codecov.io/gh/bigeasy/sympatico)
// [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
//
// An atomic log with a parititioned consensus algorithm.
//
// | What          | Where                                         |
// | --- | --- |
// | Discussion    | https://github.com/bigeasy/sympatico/issues/1 |
// | Documentation | https://bigeasy.github.io/sympatico           |
// | Source        | https://github.com/bigeasy/sympatico          |
// | Issues        | https://github.com/bigeasy/sympatico/issues   |
// | CI            | https://travis-ci.org/bigeasy/sympatico       |
// | Coverage:     | https://codecov.io/gh/bigeasy/sympatico       |
// | License:      | MIT                                           |
//
// Sympatico installs from NPM.

// This `README.md` is also a unit test using the
// [Proof](https://github.com/bigeasy/proof) unit test framework. We'll use the
// Proof `okay` function to assert out statements in the readme. A Proof unit test
// generally looks like this.

require('proof')(1, async okay => {
    // ## Further Documentation

    const Sympatico = require('../redux')
    okay(Sympatico, 'require')
})

// You can run this unit test yourself to see the output from the various
// code sections of the readme.
