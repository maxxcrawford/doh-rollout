module.exports = {
    "env": {
        "browser": true,
        "es6": true,
        "webextensions": true
    },
    "extends": [
        "eslint:recommended",
        "plugin:jest/recommended"
    ],
    "globals": {
    },
    "parserOptions": {
        "ecmaVersion": 8,
        "sourceType": "module"
    },
    "plugins": ["jest"],
    "root": true,
    "rules": {
        "indent": ["warn", 2],
        "linebreak-style": ["error", "unix"],
        "quotes": ["error", "double"],
        "semi": ["error", "always"]
    }
};
