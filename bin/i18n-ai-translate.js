#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/dotenv/package.json
var require_package = __commonJS({
  "node_modules/dotenv/package.json"(exports2, module2) {
    module2.exports = {
      name: "dotenv",
      version: "16.4.1",
      description: "Loads environment variables from .env file",
      main: "lib/main.js",
      types: "lib/main.d.ts",
      exports: {
        ".": {
          types: "./lib/main.d.ts",
          require: "./lib/main.js",
          default: "./lib/main.js"
        },
        "./config": "./config.js",
        "./config.js": "./config.js",
        "./lib/env-options": "./lib/env-options.js",
        "./lib/env-options.js": "./lib/env-options.js",
        "./lib/cli-options": "./lib/cli-options.js",
        "./lib/cli-options.js": "./lib/cli-options.js",
        "./package.json": "./package.json"
      },
      scripts: {
        "dts-check": "tsc --project tests/types/tsconfig.json",
        lint: "standard",
        "lint-readme": "standard-markdown",
        pretest: "npm run lint && npm run dts-check",
        test: "tap tests/*.js --100 -Rspec",
        prerelease: "npm test",
        release: "standard-version"
      },
      repository: {
        type: "git",
        url: "git://github.com/motdotla/dotenv.git"
      },
      funding: "https://github.com/motdotla/dotenv?sponsor=1",
      keywords: [
        "dotenv",
        "env",
        ".env",
        "environment",
        "variables",
        "config",
        "settings"
      ],
      readmeFilename: "README.md",
      license: "BSD-2-Clause",
      devDependencies: {
        "@definitelytyped/dtslint": "^0.0.133",
        "@types/node": "^18.11.3",
        decache: "^4.6.1",
        sinon: "^14.0.1",
        standard: "^17.0.0",
        "standard-markdown": "^7.1.0",
        "standard-version": "^9.5.0",
        tap: "^16.3.0",
        tar: "^6.1.11",
        typescript: "^4.8.4"
      },
      engines: {
        node: ">=12"
      },
      browser: {
        fs: false
      }
    };
  }
});

// node_modules/dotenv/lib/main.js
var require_main = __commonJS({
  "node_modules/dotenv/lib/main.js"(exports2, module2) {
    var fs2 = require("fs");
    var path2 = require("path");
    var os = require("os");
    var crypto = require("crypto");
    var packageJson = require_package();
    var version = packageJson.version;
    var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
    function parse(src) {
      const obj = {};
      let lines = src.toString();
      lines = lines.replace(/\r\n?/mg, "\n");
      let match;
      while ((match = LINE.exec(lines)) != null) {
        const key = match[1];
        let value = match[2] || "";
        value = value.trim();
        const maybeQuote = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
        if (maybeQuote === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        obj[key] = value;
      }
      return obj;
    }
    function _parseVault(options) {
      const vaultPath = _vaultPath(options);
      const result = DotenvModule.configDotenv({ path: vaultPath });
      if (!result.parsed) {
        const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
        err.code = "MISSING_DATA";
        throw err;
      }
      const keys = _dotenvKey(options).split(",");
      const length = keys.length;
      let decrypted;
      for (let i = 0; i < length; i++) {
        try {
          const key = keys[i].trim();
          const attrs = _instructions(result, key);
          decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
          break;
        } catch (error) {
          if (i + 1 >= length) {
            throw error;
          }
        }
      }
      return DotenvModule.parse(decrypted);
    }
    function _log(message) {
      console.log(`[dotenv@${version}][INFO] ${message}`);
    }
    function _warn(message) {
      console.log(`[dotenv@${version}][WARN] ${message}`);
    }
    function _debug(message) {
      console.log(`[dotenv@${version}][DEBUG] ${message}`);
    }
    function _dotenvKey(options) {
      if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
        return options.DOTENV_KEY;
      }
      if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
        return process.env.DOTENV_KEY;
      }
      return "";
    }
    function _instructions(result, dotenvKey) {
      let uri;
      try {
        uri = new URL(dotenvKey);
      } catch (error) {
        if (error.code === "ERR_INVALID_URL") {
          const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenv.org/vault/.env.vault?environment=development");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        }
        throw error;
      }
      const key = uri.password;
      if (!key) {
        const err = new Error("INVALID_DOTENV_KEY: Missing key part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environment = uri.searchParams.get("environment");
      if (!environment) {
        const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
      const ciphertext = result.parsed[environmentKey];
      if (!ciphertext) {
        const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
        err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
        throw err;
      }
      return { ciphertext, key };
    }
    function _vaultPath(options) {
      let possibleVaultPath = null;
      if (options && options.path && options.path.length > 0) {
        if (Array.isArray(options.path)) {
          for (const filepath of options.path) {
            if (fs2.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path2.resolve(process.cwd(), ".env.vault");
      }
      if (fs2.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path2.join(os.homedir(), envPath.slice(1)) : envPath;
    }
    function _configVault(options) {
      _log("Loading env from encrypted .env.vault");
      const parsed = DotenvModule._parseVault(options);
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsed, options);
      return { parsed };
    }
    function configDotenv(options) {
      let dotenvPath = path2.resolve(process.cwd(), ".env");
      let encoding = "utf8";
      const debug = Boolean(options && options.debug);
      if (options) {
        if (options.path != null) {
          let envPath = options.path;
          if (Array.isArray(envPath)) {
            for (const filepath of options.path) {
              if (fs2.existsSync(filepath)) {
                envPath = filepath;
                break;
              }
            }
          }
          dotenvPath = _resolveHome(envPath);
        }
        if (options.encoding != null) {
          encoding = options.encoding;
        } else {
          if (debug) {
            _debug("No encoding is specified. UTF-8 is used by default");
          }
        }
      }
      try {
        const parsed = DotenvModule.parse(fs2.readFileSync(dotenvPath, { encoding }));
        let processEnv = process.env;
        if (options && options.processEnv != null) {
          processEnv = options.processEnv;
        }
        DotenvModule.populate(processEnv, parsed, options);
        return { parsed };
      } catch (e) {
        if (debug) {
          _debug(`Failed to load ${dotenvPath} ${e.message}`);
        }
        return { error: e };
      }
    }
    function config2(options) {
      if (_dotenvKey(options).length === 0) {
        return DotenvModule.configDotenv(options);
      }
      const vaultPath = _vaultPath(options);
      if (!vaultPath) {
        _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);
        return DotenvModule.configDotenv(options);
      }
      return DotenvModule._configVault(options);
    }
    function decrypt(encrypted, keyStr) {
      const key = Buffer.from(keyStr.slice(-64), "hex");
      let ciphertext = Buffer.from(encrypted, "base64");
      const nonce = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(-16);
      ciphertext = ciphertext.subarray(12, -16);
      try {
        const aesgcm = crypto.createDecipheriv("aes-256-gcm", key, nonce);
        aesgcm.setAuthTag(authTag);
        return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
      } catch (error) {
        const isRange = error instanceof RangeError;
        const invalidKeyLength = error.message === "Invalid key length";
        const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
        if (isRange || invalidKeyLength) {
          const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        } else if (decryptionFailed) {
          const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
          err.code = "DECRYPTION_FAILED";
          throw err;
        } else {
          throw error;
        }
      }
    }
    function populate(processEnv, parsed, options = {}) {
      const debug = Boolean(options && options.debug);
      const override = Boolean(options && options.override);
      if (typeof parsed !== "object") {
        const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
        err.code = "OBJECT_REQUIRED";
        throw err;
      }
      for (const key of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
          if (override === true) {
            processEnv[key] = parsed[key];
          }
          if (debug) {
            if (override === true) {
              _debug(`"${key}" is already defined and WAS overwritten`);
            } else {
              _debug(`"${key}" is already defined and was NOT overwritten`);
            }
          }
        } else {
          processEnv[key] = parsed[key];
        }
      }
    }
    var DotenvModule = {
      configDotenv,
      _configVault,
      _parseVault,
      config: config2,
      decrypt,
      parse,
      populate
    };
    module2.exports.configDotenv = DotenvModule.configDotenv;
    module2.exports._configVault = DotenvModule._configVault;
    module2.exports._parseVault = DotenvModule._parseVault;
    module2.exports.config = DotenvModule.config;
    module2.exports.decrypt = DotenvModule.decrypt;
    module2.exports.parse = DotenvModule.parse;
    module2.exports.populate = DotenvModule.populate;
    module2.exports = DotenvModule;
  }
});

// node_modules/iso-639-1/src/data.js
var require_data = __commonJS({
  "node_modules/iso-639-1/src/data.js"(exports2, module2) {
    var LANGUAGES_LIST = {
      aa: {
        name: "Afar",
        nativeName: "Afaraf"
      },
      ab: {
        name: "Abkhaz",
        nativeName: "\u0430\u04A7\u0441\u0443\u0430 \u0431\u044B\u0437\u0448\u04D9\u0430"
      },
      ae: {
        name: "Avestan",
        nativeName: "avesta"
      },
      af: {
        name: "Afrikaans",
        nativeName: "Afrikaans"
      },
      ak: {
        name: "Akan",
        nativeName: "Akan"
      },
      am: {
        name: "Amharic",
        nativeName: "\u12A0\u121B\u122D\u129B"
      },
      an: {
        name: "Aragonese",
        nativeName: "aragon\xE9s"
      },
      ar: {
        name: "Arabic",
        nativeName: "\u0627\u064E\u0644\u0652\u0639\u064E\u0631\u064E\u0628\u0650\u064A\u064E\u0651\u0629\u064F"
      },
      as: {
        name: "Assamese",
        nativeName: "\u0985\u09B8\u09AE\u09C0\u09AF\u09BC\u09BE"
      },
      av: {
        name: "Avaric",
        nativeName: "\u0430\u0432\u0430\u0440 \u043C\u0430\u0446\u04C0"
      },
      ay: {
        name: "Aymara",
        nativeName: "aymar aru"
      },
      az: {
        name: "Azerbaijani",
        nativeName: "az\u0259rbaycan dili"
      },
      ba: {
        name: "Bashkir",
        nativeName: "\u0431\u0430\u0448\u04A1\u043E\u0440\u0442 \u0442\u0435\u043B\u0435"
      },
      be: {
        name: "Belarusian",
        nativeName: "\u0431\u0435\u043B\u0430\u0440\u0443\u0441\u043A\u0430\u044F \u043C\u043E\u0432\u0430"
      },
      bg: {
        name: "Bulgarian",
        nativeName: "\u0431\u044A\u043B\u0433\u0430\u0440\u0441\u043A\u0438 \u0435\u0437\u0438\u043A"
      },
      bi: {
        name: "Bislama",
        nativeName: "Bislama"
      },
      bm: {
        name: "Bambara",
        nativeName: "bamanankan"
      },
      bn: {
        name: "Bengali",
        nativeName: "\u09AC\u09BE\u0982\u09B2\u09BE"
      },
      bo: {
        name: "Tibetan",
        nativeName: "\u0F56\u0F7C\u0F51\u0F0B\u0F61\u0F72\u0F42"
      },
      br: {
        name: "Breton",
        nativeName: "brezhoneg"
      },
      bs: {
        name: "Bosnian",
        nativeName: "bosanski jezik"
      },
      ca: {
        name: "Catalan",
        nativeName: "Catal\xE0"
      },
      ce: {
        name: "Chechen",
        nativeName: "\u043D\u043E\u0445\u0447\u0438\u0439\u043D \u043C\u043E\u0442\u0442"
      },
      ch: {
        name: "Chamorro",
        nativeName: "Chamoru"
      },
      co: {
        name: "Corsican",
        nativeName: "corsu"
      },
      cr: {
        name: "Cree",
        nativeName: "\u14C0\u1426\u1403\u152D\u140D\u140F\u1423"
      },
      cs: {
        name: "Czech",
        nativeName: "\u010De\u0161tina"
      },
      cu: {
        name: "Old Church Slavonic",
        nativeName: "\u0469\u0437\u044B\u043A\u044A \u0441\u043B\u043E\u0432\u0463\u043D\u044C\u0441\u043A\u044A"
      },
      cv: {
        name: "Chuvash",
        nativeName: "\u0447\u04D1\u0432\u0430\u0448 \u0447\u04D7\u043B\u0445\u0438"
      },
      cy: {
        name: "Welsh",
        nativeName: "Cymraeg"
      },
      da: {
        name: "Danish",
        nativeName: "dansk"
      },
      de: {
        name: "German",
        nativeName: "Deutsch"
      },
      dv: {
        name: "Divehi",
        nativeName: "\u078B\u07A8\u0788\u07AC\u0780\u07A8"
      },
      dz: {
        name: "Dzongkha",
        nativeName: "\u0F62\u0FAB\u0F7C\u0F44\u0F0B\u0F41"
      },
      ee: {
        name: "Ewe",
        nativeName: "E\u028Begbe"
      },
      el: {
        name: "Greek",
        nativeName: "\u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC"
      },
      en: {
        name: "English",
        nativeName: "English"
      },
      eo: {
        name: "Esperanto",
        nativeName: "Esperanto"
      },
      es: {
        name: "Spanish",
        nativeName: "Espa\xF1ol"
      },
      et: {
        name: "Estonian",
        nativeName: "eesti"
      },
      eu: {
        name: "Basque",
        nativeName: "euskara"
      },
      fa: {
        name: "Persian",
        nativeName: "\u0641\u0627\u0631\u0633\u06CC"
      },
      ff: {
        name: "Fula",
        nativeName: "Fulfulde"
      },
      fi: {
        name: "Finnish",
        nativeName: "suomi"
      },
      fj: {
        name: "Fijian",
        nativeName: "vosa Vakaviti"
      },
      fo: {
        name: "Faroese",
        nativeName: "f\xF8royskt"
      },
      fr: {
        name: "French",
        nativeName: "Fran\xE7ais"
      },
      fy: {
        name: "Western Frisian",
        nativeName: "Frysk"
      },
      ga: {
        name: "Irish",
        nativeName: "Gaeilge"
      },
      gd: {
        name: "Scottish Gaelic",
        nativeName: "G\xE0idhlig"
      },
      gl: {
        name: "Galician",
        nativeName: "galego"
      },
      gn: {
        name: "Guaran\xED",
        nativeName: "Ava\xF1e'\u1EBD"
      },
      gu: {
        name: "Gujarati",
        nativeName: "\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0"
      },
      gv: {
        name: "Manx",
        nativeName: "Gaelg"
      },
      ha: {
        name: "Hausa",
        nativeName: "\u0647\u064E\u0648\u064F\u0633\u064E"
      },
      he: {
        name: "Hebrew",
        nativeName: "\u05E2\u05D1\u05E8\u05D9\u05EA"
      },
      hi: {
        name: "Hindi",
        nativeName: "\u0939\u093F\u0928\u094D\u0926\u0940"
      },
      ho: {
        name: "Hiri Motu",
        nativeName: "Hiri Motu"
      },
      hr: {
        name: "Croatian",
        nativeName: "Hrvatski"
      },
      ht: {
        name: "Haitian",
        nativeName: "Krey\xF2l ayisyen"
      },
      hu: {
        name: "Hungarian",
        nativeName: "magyar"
      },
      hy: {
        name: "Armenian",
        nativeName: "\u0540\u0561\u0575\u0565\u0580\u0565\u0576"
      },
      hz: {
        name: "Herero",
        nativeName: "Otjiherero"
      },
      ia: {
        name: "Interlingua",
        nativeName: "Interlingua"
      },
      id: {
        name: "Indonesian",
        nativeName: "Bahasa Indonesia"
      },
      ie: {
        name: "Interlingue",
        nativeName: "Interlingue"
      },
      ig: {
        name: "Igbo",
        nativeName: "As\u1EE5s\u1EE5 Igbo"
      },
      ii: {
        name: "Nuosu",
        nativeName: "\uA188\uA320\uA4BF Nuosuhxop"
      },
      ik: {
        name: "Inupiaq",
        nativeName: "I\xF1upiaq"
      },
      io: {
        name: "Ido",
        nativeName: "Ido"
      },
      is: {
        name: "Icelandic",
        nativeName: "\xCDslenska"
      },
      it: {
        name: "Italian",
        nativeName: "Italiano"
      },
      iu: {
        name: "Inuktitut",
        nativeName: "\u1403\u14C4\u1483\u144E\u1450\u1466"
      },
      ja: {
        name: "Japanese",
        nativeName: "\u65E5\u672C\u8A9E"
      },
      jv: {
        name: "Javanese",
        nativeName: "basa Jawa"
      },
      ka: {
        name: "Georgian",
        nativeName: "\u10E5\u10D0\u10E0\u10D7\u10E3\u10DA\u10D8"
      },
      kg: {
        name: "Kongo",
        nativeName: "Kikongo"
      },
      ki: {
        name: "Kikuyu",
        nativeName: "G\u0129k\u0169y\u0169"
      },
      kj: {
        name: "Kwanyama",
        nativeName: "Kuanyama"
      },
      kk: {
        name: "Kazakh",
        nativeName: "\u049B\u0430\u0437\u0430\u049B \u0442\u0456\u043B\u0456"
      },
      kl: {
        name: "Kalaallisut",
        nativeName: "kalaallisut"
      },
      km: {
        name: "Khmer",
        nativeName: "\u1781\u17C1\u1798\u179A\u1797\u17B6\u179F\u17B6"
      },
      kn: {
        name: "Kannada",
        nativeName: "\u0C95\u0CA8\u0CCD\u0CA8\u0CA1"
      },
      ko: {
        name: "Korean",
        nativeName: "\uD55C\uAD6D\uC5B4"
      },
      kr: {
        name: "Kanuri",
        nativeName: "Kanuri"
      },
      ks: {
        name: "Kashmiri",
        nativeName: "\u0915\u0936\u094D\u092E\u0940\u0930\u0940"
      },
      ku: {
        name: "Kurdish",
        nativeName: "Kurd\xEE"
      },
      kv: {
        name: "Komi",
        nativeName: "\u043A\u043E\u043C\u0438 \u043A\u044B\u0432"
      },
      kw: {
        name: "Cornish",
        nativeName: "Kernewek"
      },
      ky: {
        name: "Kyrgyz",
        nativeName: "\u041A\u044B\u0440\u0433\u044B\u0437\u0447\u0430"
      },
      la: {
        name: "Latin",
        nativeName: "latine"
      },
      lb: {
        name: "Luxembourgish",
        nativeName: "L\xEBtzebuergesch"
      },
      lg: {
        name: "Ganda",
        nativeName: "Luganda"
      },
      li: {
        name: "Limburgish",
        nativeName: "Limburgs"
      },
      ln: {
        name: "Lingala",
        nativeName: "Ling\xE1la"
      },
      lo: {
        name: "Lao",
        nativeName: "\u0E9E\u0EB2\u0EAA\u0EB2\u0EA5\u0EB2\u0EA7"
      },
      lt: {
        name: "Lithuanian",
        nativeName: "lietuvi\u0173 kalba"
      },
      lu: {
        name: "Luba-Katanga",
        nativeName: "Kiluba"
      },
      lv: {
        name: "Latvian",
        nativeName: "latvie\u0161u valoda"
      },
      mg: {
        name: "Malagasy",
        nativeName: "fiteny malagasy"
      },
      mh: {
        name: "Marshallese",
        nativeName: "Kajin M\u0327aje\u013C"
      },
      mi: {
        name: "M\u0101ori",
        nativeName: "te reo M\u0101ori"
      },
      mk: {
        name: "Macedonian",
        nativeName: "\u043C\u0430\u043A\u0435\u0434\u043E\u043D\u0441\u043A\u0438 \u0458\u0430\u0437\u0438\u043A"
      },
      ml: {
        name: "Malayalam",
        nativeName: "\u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02"
      },
      mn: {
        name: "Mongolian",
        nativeName: "\u041C\u043E\u043D\u0433\u043E\u043B \u0445\u044D\u043B"
      },
      mr: {
        name: "Marathi",
        nativeName: "\u092E\u0930\u093E\u0920\u0940"
      },
      ms: {
        name: "Malay",
        nativeName: "Bahasa Melayu"
      },
      mt: {
        name: "Maltese",
        nativeName: "Malti"
      },
      my: {
        name: "Burmese",
        nativeName: "\u1017\u1019\u102C\u1005\u102C"
      },
      na: {
        name: "Nauru",
        nativeName: "Dorerin Naoero"
      },
      nb: {
        name: "Norwegian Bokm\xE5l",
        nativeName: "Norsk bokm\xE5l"
      },
      nd: {
        name: "Northern Ndebele",
        nativeName: "isiNdebele"
      },
      ne: {
        name: "Nepali",
        nativeName: "\u0928\u0947\u092A\u093E\u0932\u0940"
      },
      ng: {
        name: "Ndonga",
        nativeName: "Owambo"
      },
      nl: {
        name: "Dutch",
        nativeName: "Nederlands"
      },
      nn: {
        name: "Norwegian Nynorsk",
        nativeName: "Norsk nynorsk"
      },
      no: {
        name: "Norwegian",
        nativeName: "Norsk"
      },
      nr: {
        name: "Southern Ndebele",
        nativeName: "isiNdebele"
      },
      nv: {
        name: "Navajo",
        nativeName: "Din\xE9 bizaad"
      },
      ny: {
        name: "Chichewa",
        nativeName: "chiChe\u0175a"
      },
      oc: {
        name: "Occitan",
        nativeName: "occitan"
      },
      oj: {
        name: "Ojibwe",
        nativeName: "\u140A\u14C2\u1511\u14C8\u142F\u14A7\u140E\u14D0"
      },
      om: {
        name: "Oromo",
        nativeName: "Afaan Oromoo"
      },
      or: {
        name: "Oriya",
        nativeName: "\u0B13\u0B21\u0B3C\u0B3F\u0B06"
      },
      os: {
        name: "Ossetian",
        nativeName: "\u0438\u0440\u043E\u043D \xE6\u0432\u0437\u0430\u0433"
      },
      pa: {
        name: "Panjabi",
        nativeName: "\u0A2A\u0A70\u0A1C\u0A3E\u0A2C\u0A40"
      },
      pi: {
        name: "P\u0101li",
        nativeName: "\u092A\u093E\u0934\u093F"
      },
      pl: {
        name: "Polish",
        nativeName: "Polski"
      },
      ps: {
        name: "Pashto",
        nativeName: "\u067E\u069A\u062A\u0648"
      },
      pt: {
        name: "Portuguese",
        nativeName: "Portugu\xEAs"
      },
      qu: {
        name: "Quechua",
        nativeName: "Runa Simi"
      },
      rm: {
        name: "Romansh",
        nativeName: "rumantsch grischun"
      },
      rn: {
        name: "Kirundi",
        nativeName: "Ikirundi"
      },
      ro: {
        name: "Romanian",
        nativeName: "Rom\xE2n\u0103"
      },
      ru: {
        name: "Russian",
        nativeName: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439"
      },
      rw: {
        name: "Kinyarwanda",
        nativeName: "Ikinyarwanda"
      },
      sa: {
        name: "Sanskrit",
        nativeName: "\u0938\u0902\u0938\u094D\u0915\u0943\u0924\u092E\u094D"
      },
      sc: {
        name: "Sardinian",
        nativeName: "sardu"
      },
      sd: {
        name: "Sindhi",
        nativeName: "\u0938\u093F\u0928\u094D\u0927\u0940"
      },
      se: {
        name: "Northern Sami",
        nativeName: "Davvis\xE1megiella"
      },
      sg: {
        name: "Sango",
        nativeName: "y\xE2ng\xE2 t\xEE s\xE4ng\xF6"
      },
      si: {
        name: "Sinhala",
        nativeName: "\u0DC3\u0DD2\u0D82\u0DC4\u0DBD"
      },
      sk: {
        name: "Slovak",
        nativeName: "sloven\u010Dina"
      },
      sl: {
        name: "Slovenian",
        nativeName: "sloven\u0161\u010Dina"
      },
      sm: {
        name: "Samoan",
        nativeName: "gagana fa'a Samoa"
      },
      sn: {
        name: "Shona",
        nativeName: "chiShona"
      },
      so: {
        name: "Somali",
        nativeName: "Soomaaliga"
      },
      sq: {
        name: "Albanian",
        nativeName: "Shqip"
      },
      sr: {
        name: "Serbian",
        nativeName: "\u0441\u0440\u043F\u0441\u043A\u0438 \u0458\u0435\u0437\u0438\u043A"
      },
      ss: {
        name: "Swati",
        nativeName: "SiSwati"
      },
      st: {
        name: "Southern Sotho",
        nativeName: "Sesotho"
      },
      su: {
        name: "Sundanese",
        nativeName: "Basa Sunda"
      },
      sv: {
        name: "Swedish",
        nativeName: "Svenska"
      },
      sw: {
        name: "Swahili",
        nativeName: "Kiswahili"
      },
      ta: {
        name: "Tamil",
        nativeName: "\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD"
      },
      te: {
        name: "Telugu",
        nativeName: "\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41"
      },
      tg: {
        name: "Tajik",
        nativeName: "\u0442\u043E\u04B7\u0438\u043A\u04E3"
      },
      th: {
        name: "Thai",
        nativeName: "\u0E44\u0E17\u0E22"
      },
      ti: {
        name: "Tigrinya",
        nativeName: "\u1275\u130D\u122D\u129B"
      },
      tk: {
        name: "Turkmen",
        nativeName: "T\xFCrkmen\xE7e"
      },
      tl: {
        name: "Tagalog",
        nativeName: "Wikang Tagalog"
      },
      tn: {
        name: "Tswana",
        nativeName: "Setswana"
      },
      to: {
        name: "Tonga",
        nativeName: "faka Tonga"
      },
      tr: {
        name: "Turkish",
        nativeName: "T\xFCrk\xE7e"
      },
      ts: {
        name: "Tsonga",
        nativeName: "Xitsonga"
      },
      tt: {
        name: "Tatar",
        nativeName: "\u0442\u0430\u0442\u0430\u0440 \u0442\u0435\u043B\u0435"
      },
      tw: {
        name: "Twi",
        nativeName: "Twi"
      },
      ty: {
        name: "Tahitian",
        nativeName: "Reo Tahiti"
      },
      ug: {
        name: "Uyghur",
        nativeName: "\u0626\u06C7\u064A\u063A\u06C7\u0631\u0686\u06D5\u200E"
      },
      uk: {
        name: "Ukrainian",
        nativeName: "\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430"
      },
      ur: {
        name: "Urdu",
        nativeName: "\u0627\u0631\u062F\u0648"
      },
      uz: {
        name: "Uzbek",
        nativeName: "\u040E\u0437\u0431\u0435\u043A"
      },
      ve: {
        name: "Venda",
        nativeName: "Tshiven\u1E13a"
      },
      vi: {
        name: "Vietnamese",
        nativeName: "Ti\u1EBFng Vi\u1EC7t"
      },
      vo: {
        name: "Volap\xFCk",
        nativeName: "Volap\xFCk"
      },
      wa: {
        name: "Walloon",
        nativeName: "walon"
      },
      wo: {
        name: "Wolof",
        nativeName: "Wollof"
      },
      xh: {
        name: "Xhosa",
        nativeName: "isiXhosa"
      },
      yi: {
        name: "Yiddish",
        nativeName: "\u05D9\u05D9\u05B4\u05D3\u05D9\u05E9"
      },
      yo: {
        name: "Yoruba",
        nativeName: "Yor\xF9b\xE1"
      },
      za: {
        name: "Zhuang",
        nativeName: "Sa\u026F cue\u014B\u0185"
      },
      zh: {
        name: "Chinese",
        nativeName: "\u4E2D\u6587"
      },
      zu: {
        name: "Zulu",
        nativeName: "isiZulu"
      }
    };
    module2.exports = LANGUAGES_LIST;
  }
});

// node_modules/iso-639-1/src/index.js
var require_src = __commonJS({
  "node_modules/iso-639-1/src/index.js"(exports2, module2) {
    var LANGUAGES_LIST = require_data();
    var LANGUAGES = {};
    var LANGUAGES_BY_NAME = {};
    var LANGUAGE_CODES = [];
    var LANGUAGE_NAMES = [];
    var LANGUAGE_NATIVE_NAMES = [];
    for (const code in LANGUAGES_LIST) {
      const { name, nativeName } = LANGUAGES_LIST[code];
      LANGUAGES[code] = LANGUAGES_BY_NAME[name.toLowerCase()] = LANGUAGES_BY_NAME[nativeName.toLowerCase()] = { code, name, nativeName };
      LANGUAGE_CODES.push(code);
      LANGUAGE_NAMES.push(name);
      LANGUAGE_NATIVE_NAMES.push(nativeName);
    }
    module2.exports = class ISO63912 {
      static getLanguages(codes = []) {
        return codes.map(
          (code) => ISO63912.validate(code) ? Object.assign({}, LANGUAGES[code]) : { code, name: "", nativeName: "" }
        );
      }
      static getName(code) {
        return ISO63912.validate(code) ? LANGUAGES_LIST[code].name : "";
      }
      static getAllNames() {
        return LANGUAGE_NAMES.slice();
      }
      static getNativeName(code) {
        return ISO63912.validate(code) ? LANGUAGES_LIST[code].nativeName : "";
      }
      static getAllNativeNames() {
        return LANGUAGE_NATIVE_NAMES.slice();
      }
      static getCode(name) {
        name = name.toLowerCase();
        return LANGUAGES_BY_NAME.hasOwnProperty(name) ? LANGUAGES_BY_NAME[name].code : "";
      }
      static getAllCodes() {
        return LANGUAGE_CODES.slice();
      }
      static validate(code) {
        return LANGUAGES_LIST.hasOwnProperty(code);
      }
    };
  }
});

// node_modules/flat/index.js
var require_flat = __commonJS({
  "node_modules/flat/index.js"(exports2, module2) {
    module2.exports = flatten2;
    flatten2.flatten = flatten2;
    flatten2.unflatten = unflatten2;
    function isBuffer(obj) {
      return obj && obj.constructor && typeof obj.constructor.isBuffer === "function" && obj.constructor.isBuffer(obj);
    }
    function keyIdentity(key) {
      return key;
    }
    function flatten2(target, opts) {
      opts = opts || {};
      const delimiter = opts.delimiter || ".";
      const maxDepth = opts.maxDepth;
      const transformKey = opts.transformKey || keyIdentity;
      const output = {};
      function step(object, prev, currentDepth) {
        currentDepth = currentDepth || 1;
        Object.keys(object).forEach(function(key) {
          const value = object[key];
          const isarray = opts.safe && Array.isArray(value);
          const type = Object.prototype.toString.call(value);
          const isbuffer = isBuffer(value);
          const isobject = type === "[object Object]" || type === "[object Array]";
          const newKey = prev ? prev + delimiter + transformKey(key) : transformKey(key);
          if (!isarray && !isbuffer && isobject && Object.keys(value).length && (!opts.maxDepth || currentDepth < maxDepth)) {
            return step(value, newKey, currentDepth + 1);
          }
          output[newKey] = value;
        });
      }
      step(target);
      return output;
    }
    function unflatten2(target, opts) {
      opts = opts || {};
      const delimiter = opts.delimiter || ".";
      const overwrite = opts.overwrite || false;
      const transformKey = opts.transformKey || keyIdentity;
      const result = {};
      const isbuffer = isBuffer(target);
      if (isbuffer || Object.prototype.toString.call(target) !== "[object Object]") {
        return target;
      }
      function getkey(key) {
        const parsedKey = Number(key);
        return isNaN(parsedKey) || key.indexOf(".") !== -1 || opts.object ? key : parsedKey;
      }
      function addKeys(keyPrefix, recipient, target2) {
        return Object.keys(target2).reduce(function(result2, key) {
          result2[keyPrefix + delimiter + key] = target2[key];
          return result2;
        }, recipient);
      }
      function isEmpty(val) {
        const type = Object.prototype.toString.call(val);
        const isArray = type === "[object Array]";
        const isObject = type === "[object Object]";
        if (!val) {
          return true;
        } else if (isArray) {
          return !val.length;
        } else if (isObject) {
          return !Object.keys(val).length;
        }
      }
      target = Object.keys(target).reduce(function(result2, key) {
        const type = Object.prototype.toString.call(target[key]);
        const isObject = type === "[object Object]" || type === "[object Array]";
        if (!isObject || isEmpty(target[key])) {
          result2[key] = target[key];
          return result2;
        } else {
          return addKeys(
            key,
            result2,
            flatten2(target[key], opts)
          );
        }
      }, {});
      Object.keys(target).forEach(function(key) {
        const split = key.split(delimiter).map(transformKey);
        let key1 = getkey(split.shift());
        let key2 = getkey(split[0]);
        let recipient = result;
        while (key2 !== void 0) {
          if (key1 === "__proto__") {
            return;
          }
          const type = Object.prototype.toString.call(recipient[key1]);
          const isobject = type === "[object Object]" || type === "[object Array]";
          if (!overwrite && !isobject && typeof recipient[key1] !== "undefined") {
            return;
          }
          if (overwrite && !isobject || !overwrite && recipient[key1] == null) {
            recipient[key1] = typeof key2 === "number" && !opts.object ? [] : {};
          }
          recipient = recipient[key1];
          if (split.length > 0) {
            key1 = getkey(split.shift());
            key2 = getkey(split[0]);
          }
        }
        recipient[key1] = unflatten2(target[key], opts);
      });
      return result;
    }
  }
});

// node_modules/commander/lib/error.js
var require_error = __commonJS({
  "node_modules/commander/lib/error.js"(exports2) {
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @constructor
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       * @constructor
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports2.CommanderError = CommanderError2;
    exports2.InvalidArgumentError = InvalidArgumentError2;
  }
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "node_modules/commander/lib/argument.js"(exports2) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.length > 3 && this._name.slice(-3) === "...") {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @api private
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(`Allowed choices are ${this.argChoices.join(", ")}.`);
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports2.Argument = Argument2;
    exports2.humanReadableArgName = humanReadableArgName;
  }
});

// node_modules/commander/lib/help.js
var require_help = __commonJS({
  "node_modules/commander/lib/help.js"(exports2) {
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        if (cmd._hasImplicitHelpCommand()) {
          const [, helpName, helpArgs] = cmd._helpCommandnameAndArgs.match(/([^ ]+) *(.*)/);
          const helpCommand = cmd.createCommand(helpName).helpOption(false);
          helpCommand.description(cmd._helpCommandDescription);
          if (helpArgs)
            helpCommand.arguments(helpArgs);
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns number
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const showShortHelpFlag = cmd._hasHelpOption && cmd._helpShortFlag && !cmd._findOption(cmd._helpShortFlag);
        const showLongHelpFlag = cmd._hasHelpOption && !cmd._findOption(cmd._helpLongFlag);
        if (showShortHelpFlag || showLongHelpFlag) {
          let helpOption;
          if (!showShortHelpFlag) {
            helpOption = cmd.createOption(cmd._helpLongFlag, cmd._helpDescription);
          } else if (!showLongHelpFlag) {
            helpOption = cmd.createOption(cmd._helpShortFlag, cmd._helpDescription);
          } else {
            helpOption = cmd.createOption(cmd._helpFlags, cmd._helpDescription);
          }
          visibleOptions.push(helpOption);
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions)
          return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter((option) => !option.hidden);
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(max, helper.subcommandTerm(command).length);
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(max, helper.argumentTerm(argument).length);
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(`default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`);
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          return `${option.description} (${extraInfo.join(", ")})`;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(`default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`);
        }
        if (extraInfo.length > 0) {
          const extraDescripton = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescripton}`;
          }
          return extraDescripton;
        }
        return argument.description;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth || 80;
        const itemIndentWidth = 2;
        const itemSeparatorWidth = 2;
        function formatItem(term, description) {
          if (description) {
            const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
            return helper.wrap(fullText, helpWidth - itemIndentWidth, termWidth + itemSeparatorWidth);
          }
          return term;
        }
        function formatList(textArray) {
          return textArray.join("\n").replace(/^/gm, " ".repeat(itemIndentWidth));
        }
        let output = [`Usage: ${helper.commandUsage(cmd)}`, ""];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([helper.wrap(commandDescription, helpWidth, 0), ""]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return formatItem(helper.argumentTerm(argument), helper.argumentDescription(argument));
        });
        if (argumentList.length > 0) {
          output = output.concat(["Arguments:", formatList(argumentList), ""]);
        }
        const optionList = helper.visibleOptions(cmd).map((option) => {
          return formatItem(helper.optionTerm(option), helper.optionDescription(option));
        });
        if (optionList.length > 0) {
          output = output.concat(["Options:", formatList(optionList), ""]);
        }
        if (this.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return formatItem(helper.optionTerm(option), helper.optionDescription(option));
          });
          if (globalOptionList.length > 0) {
            output = output.concat(["Global Options:", formatList(globalOptionList), ""]);
          }
        }
        const commandList = helper.visibleCommands(cmd).map((cmd2) => {
          return formatItem(helper.subcommandTerm(cmd2), helper.subcommandDescription(cmd2));
        });
        if (commandList.length > 0) {
          output = output.concat(["Commands:", formatList(commandList), ""]);
        }
        return output.join("\n");
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Wrap the given string to width characters per line, with lines after the first indented.
       * Do not wrap if insufficient room for wrapping (minColumnWidth), or string is manually formatted.
       *
       * @param {string} str
       * @param {number} width
       * @param {number} indent
       * @param {number} [minColumnWidth=40]
       * @return {string}
       *
       */
      wrap(str, width, indent, minColumnWidth = 40) {
        const indents = " \\f\\t\\v\xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF";
        const manualIndent = new RegExp(`[\\n][${indents}]+`);
        if (str.match(manualIndent))
          return str;
        const columnWidth = width - indent;
        if (columnWidth < minColumnWidth)
          return str;
        const leadingStr = str.slice(0, indent);
        const columnText = str.slice(indent).replace("\r\n", "\n");
        const indentString = " ".repeat(indent);
        const zeroWidthSpace = "\u200B";
        const breaks = `\\s${zeroWidthSpace}`;
        const regex = new RegExp(`
|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`, "g");
        const lines = columnText.match(regex) || [];
        return leadingStr + lines.map((line, i) => {
          if (line === "\n")
            return "";
          return (i > 0 ? indentString : "") + line.trimEnd();
        }).join("\n");
      }
    };
    exports2.Help = Help2;
  }
});

// node_modules/commander/lib/option.js
var require_option = __commonJS({
  "node_modules/commander/lib/option.js"(exports2) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {string | string[]} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {Object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @api private
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(`Allowed choices are ${this.argChoices.join(", ")}.`);
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as a object attribute key.
       *
       * @return {string}
       * @api private
       */
      attributeName() {
        return camelcase(this.name().replace(/^no-/, ""));
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @api private
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @api private
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey))
          return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str) {
      return str.split("-").reduce((str2, word) => {
        return str2 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const flagParts = flags.split(/[ |,]+/);
      if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1]))
        shortFlag = flagParts.shift();
      longFlag = flagParts.shift();
      if (!shortFlag && /^-[^-]$/.test(longFlag)) {
        shortFlag = longFlag;
        longFlag = void 0;
      }
      return { shortFlag, longFlag };
    }
    exports2.Option = Option2;
    exports2.splitOptionFlags = splitOptionFlags;
    exports2.DualOptions = DualOptions;
  }
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "node_modules/commander/lib/suggestSimilar.js"(exports2) {
    var maxDistance = 3;
    function editDistance(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance)
        return Math.max(a.length, b.length);
      const d = [];
      for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            // deletion
            d[i][j - 1] + 1,
            // insertion
            d[i - 1][j - 1] + cost
            // substitution
          );
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0)
        return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1)
          return;
        const distance = editDistance(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports2.suggestSimilar = suggestSimilar;
  }
});

// node_modules/commander/lib/command.js
var require_command = __commonJS({
  "node_modules/commander/lib/command.js"(exports2) {
    var EventEmitter = require("events").EventEmitter;
    var childProcess = require("child_process");
    var path2 = require("path");
    var fs2 = require("fs");
    var process2 = require("process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2, splitOptionFlags, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = true;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._outputConfiguration = {
          writeOut: (str) => process2.stdout.write(str),
          writeErr: (str) => process2.stderr.write(str),
          getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
          getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
          outputError: (str, write) => write(str)
        };
        this._hidden = false;
        this._hasHelpOption = true;
        this._helpFlags = "-h, --help";
        this._helpDescription = "display help for command";
        this._helpShortFlag = "-h";
        this._helpLongFlag = "--help";
        this._addImplicitHelpCommand = void 0;
        this._helpCommandName = "help";
        this._helpCommandnameAndArgs = "help [command]";
        this._helpCommandDescription = "display help for command";
        this._helpConfiguration = {};
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._hasHelpOption = sourceCommand._hasHelpOption;
        this._helpFlags = sourceCommand._helpFlags;
        this._helpDescription = sourceCommand._helpDescription;
        this._helpShortFlag = sourceCommand._helpShortFlag;
        this._helpLongFlag = sourceCommand._helpLongFlag;
        this._helpCommandName = sourceCommand._helpCommandName;
        this._helpCommandnameAndArgs = sourceCommand._helpCommandnameAndArgs;
        this._helpCommandDescription = sourceCommand._helpCommandDescription;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @api private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {Object|string} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {Object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault)
          this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args)
          cmd.arguments(args);
        this.commands.push(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc)
          return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {Object} [configuration] - configuration options
       * @return {Command|Object} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0)
          return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // functions to change where being written, stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // matching functions to specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // functions based on what is being written out
       *     outputError(str, write) // used for displaying errors, and not used for displaying help
       *
       * @param {Object} [configuration] - configuration options
       * @return {Command|Object} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0)
          return this._outputConfiguration;
        Object.assign(this._outputConfiguration, configuration);
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {boolean|string} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string")
          displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {Object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault)
          this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden)
          cmd._hidden = true;
        this.commands.push(cmd);
        cmd.parent = this;
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {Function|*} [fn] - custom argument processing function
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, fn, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof fn === "function") {
          argument.default(defaultValue).argParser(fn);
        } else {
          argument.default(fn);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument && previousArgument.variadic) {
          throw new Error(`only the last argument can be variadic '${previousArgument.name()}'`);
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(`a default value for a required argument is never used: '${argument.name()}'`);
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Override default decision whether to add implicit help command.
       *
       *    addHelpCommand() // force on
       *    addHelpCommand(false); // force off
       *    addHelpCommand('help [cmd]', 'display help for [cmd]'); // force on with custom details
       *
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(enableOrNameAndArgs, description) {
        if (enableOrNameAndArgs === false) {
          this._addImplicitHelpCommand = false;
        } else {
          this._addImplicitHelpCommand = true;
          if (typeof enableOrNameAndArgs === "string") {
            this._helpCommandName = enableOrNameAndArgs.split(" ")[0];
            this._helpCommandnameAndArgs = enableOrNameAndArgs;
          }
          this._helpCommandDescription = description || this._helpCommandDescription;
        }
        return this;
      }
      /**
       * @return {boolean}
       * @api private
       */
      _hasImplicitHelpCommand() {
        if (this._addImplicitHelpCommand === void 0) {
          return this.commands.length && !this._actionHandler && !this._findCommand("help");
        }
        return this._addImplicitHelpCommand;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @api private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process2.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {Option | Argument} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @api private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(name, option.defaultValue === void 0 ? true : option.defaultValue, "default");
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        this.options.push(option);
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._concatValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @api private
       */
      _optionEx(config2, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error("To add an Option object use addOption() instead of option() or requiredOption()");
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config2.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('-p, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {Function|*} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
      * Add a required option which must have a value after parsing. This usually means
      * the option must be specified on the command line. (Otherwise the same as .option().)
      *
      * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
      *
      * @param {string} flags
      * @param {string} [description]
      * @param {Function|*} [parseArg] - custom option processing function or default value
      * @param {*} [defaultValue]
      * @return {Command} `this` command for chaining
      */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx({ mandatory: true }, flags, description, parseArg, defaultValue);
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {Boolean} [combine=true] - if `true` or omitted, an optional value can be specified directly after the flag.
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {Boolean} [allowUnknown=true] - if `true` or omitted, no error will be thrown
       * for unknown options.
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {Boolean} [allowExcess=true] - if `true` or omitted, no error will be thrown
       * for excess arguments.
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {Boolean} [positional=true]
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {Boolean} [passThrough=true]
       * for unknown options.
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        if (!!this.parent && passThrough && !this.parent._enablePositionalOptions) {
          throw new Error("passThroughOptions can not be used without turning on enablePositionalOptions for parent command(s)");
        }
        return this;
      }
      /**
        * Whether to store option values as properties on command object,
        * or store separately (specify false). In both cases the option values can be accessed using .opts().
        *
        * @param {boolean} [storeAsProperties=true]
        * @return {Command} `this` command for chaining
        */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {Object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {Object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
        * Store option value and where the value came from.
        *
        * @param {string} key
        * @param {Object} value
        * @param {string} source - expected values are default/config/env/cli/implied
        * @return {Command} `this` command for chaining
        */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
        * Get source of option value.
        * Expected values are default | config | env | cli | implied
        *
        * @param {string} key
        * @return {string}
        */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
        * Get source of option value. See also .optsWithGlobals().
        * Expected values are default | config | env | cli | implied
        *
        * @param {string} key
        * @return {string}
        */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @api private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0) {
          argv = process2.argv;
          if (process2.versions && process2.versions.electron) {
            parseOptions.from = "electron";
          }
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process2.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          default:
            throw new Error(`unexpected parse option { from: '${parseOptions.from}' }`);
        }
        if (!this._name && this._scriptPath)
          this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * The default expectation is that the arguments are from node and have the application as argv[0]
       * and the script being run in argv[1], with user parameters after that.
       *
       * @example
       * program.parse(process.argv);
       * program.parse(); // implicitly use process.argv and auto-detect node vs electron conventions
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {Object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async. Returns a Promise.
       *
       * The default expectation is that the arguments are from node and have the application as argv[0]
       * and the script being run in argv[1], with user parameters after that.
       *
       * @example
       * await program.parseAsync(process.argv);
       * await program.parseAsync(); // implicitly use process.argv and auto-detect node vs electron conventions
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {Object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Execute a sub-command executable.
       *
       * @api private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path2.resolve(baseDir, baseName);
          if (fs2.existsSync(localBin))
            return localBin;
          if (sourceExt.includes(path2.extname(baseName)))
            return void 0;
          const foundExt = sourceExt.find((ext) => fs2.existsSync(`${localBin}${ext}`));
          if (foundExt)
            return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs2.realpathSync(this._scriptPath);
          } catch (err) {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path2.resolve(path2.dirname(resolvedScriptPath), executableDir);
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path2.basename(this._scriptPath, path2.extname(this._scriptPath));
            if (legacyName !== this._name) {
              localFile = findFile(executableDir, `${legacyName}-${subcommand._name}`);
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path2.extname(executableFile));
        let proc;
        if (process2.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process2.execArgv).concat(args);
            proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process2.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        if (!exitCallback) {
          proc.on("close", process2.exit.bind(process2));
        } else {
          proc.on("close", () => {
            exitCallback(new CommanderError2(process2.exitCode || 0, "commander.executeSubCommandAsync", "(close)"));
          });
        }
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
            const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
            throw new Error(executableMissing);
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process2.exit(1);
          } else {
            const wrappedError = new CommanderError2(1, "commander.executeSubCommandAsync", "(error)");
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @api private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand)
          this.help({ error: true });
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(promiseChain, subCommand, "preSubcommand");
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @api private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(subcommandName, [], [
          this._helpLongFlag || this._helpShortFlag
        ]);
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @api private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @api private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(argument, value, previous, invalidValueMessage);
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {Promise|undefined} promise
       * @param {Function} fn
       * @return {Promise|undefined}
       * @api private
       */
      _chainOrCall(promise, fn) {
        if (promise && promise.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {Promise|undefined} promise
       * @param {string} event
       * @return {Promise|undefined}
       * @api private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {Promise|undefined} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {Promise|undefined}
       * @api private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @api private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._hasImplicitHelpCommand() && operands[0] === this._helpCommandName) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          outputHelpIfRequested(this, unknown);
          return this._dispatchSubcommand(this._defaultCommandName, operands, unknown);
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        outputHelpIfRequested(this, parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(promiseChain, () => this._actionHandler(this.processedArgs));
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent && this.parent.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @api private
       */
      _findCommand(name) {
        if (!name)
          return void 0;
        return this.commands.find((cmd) => cmd._name === name || cmd._aliases.includes(name));
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @api private
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @api private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @api private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter(
          (option) => {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0) {
              return false;
            }
            return this.getOptionValueSource(optionKey) !== "default";
          }
        );
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @api private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {String[]} argv
       * @return {{operands: String[], unknown: String[]}}
       */
      parseOptions(argv) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        const args = argv.slice();
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        let activeVariadicOption = null;
        while (args.length) {
          const arg = args.shift();
          if (arg === "--") {
            if (dest === unknown)
              dest.push(arg);
            dest.push(...args);
            break;
          }
          if (activeVariadicOption && !maybeOption(arg)) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args.shift();
                if (value === void 0)
                  this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (args.length > 0 && !maybeOption(args[0])) {
                  value = args.shift();
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                args.unshift(`-${arg.slice(2)}`);
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (maybeOption(arg)) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              if (args.length > 0)
                unknown.push(...args);
              break;
            } else if (arg === this._helpCommandName && this._hasImplicitHelpCommand()) {
              operands.push(arg);
              if (args.length > 0)
                operands.push(...args);
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg);
              if (args.length > 0)
                unknown.push(...args);
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg);
            if (args.length > 0)
              dest.push(...args);
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {Object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {Object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {Object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(`${message}
`, this._outputConfiguration.writeErr);
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config2 = errorOptions || {};
        const exitCode = config2.exitCode || 1;
        const code = config2.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @api private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process2.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(this.getOptionValueSource(optionKey))) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @api private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter((option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(this.getOptionValue(option.attributeName()), option)).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(impliedKey, option.implied[impliedKey], "implied");
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @api private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @api private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @api private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @api private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find((target) => target.negate && optionKey === target.attributeName());
          const positiveOption = this.options.find((target) => !target.negate && optionKey === target.attributeName());
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @api private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption)
          return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @api private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments)
          return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @api private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias())
              candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {this | string | undefined} `this` command for chaining, or version string if no arguments
       */
      version(str, flags, description) {
        if (str === void 0)
          return this._version;
        this._version = str;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this.options.push(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str}
`);
          this._exit(0, "commander.version", str);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {Object} [argsDescription]
       * @return {string|Command}
       */
      description(str, argsDescription) {
        if (str === void 0 && argsDescription === void 0)
          return this._description;
        this._description = str;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {string|Command}
       */
      summary(str) {
        if (str === void 0)
          return this._summary;
        this._summary = str;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {string|Command}
       */
      alias(alias) {
        if (alias === void 0)
          return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name)
          throw new Error("Command alias can't be the same as its name");
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {string[]|Command}
       */
      aliases(aliases) {
        if (aliases === void 0)
          return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {String|Command}
       */
      usage(str) {
        if (str === void 0) {
          if (this._usage)
            return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._hasHelpOption ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {string|Command}
       */
      name(str) {
        if (str === void 0)
          return this._name;
        this._name = str;
        return this;
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path2.basename(filename, path2.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {string|null|Command}
       */
      executableDir(path3) {
        if (path3 === void 0)
          return this._executableDir;
        this._executableDir = path3;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        if (helper.helpWidth === void 0) {
          helper.helpWidth = contextOptions && contextOptions.error ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
        }
        return helper.formatHelp(this, helper);
      }
      /**
       * @api private
       */
      _getHelpContext(contextOptions) {
        contextOptions = contextOptions || {};
        const context = { error: !!contextOptions.error };
        let write;
        if (context.error) {
          write = (arg) => this._outputConfiguration.writeErr(arg);
        } else {
          write = (arg) => this._outputConfiguration.writeOut(arg);
        }
        context.write = contextOptions.write || write;
        context.command = this;
        return context;
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const context = this._getHelpContext(contextOptions);
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", context));
        this.emit("beforeHelp", context);
        let helpInformation = this.helpInformation(context);
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        context.write(helpInformation);
        if (this._helpLongFlag) {
          this.emit(this._helpLongFlag);
        }
        this.emit("afterHelp", context);
        this._getCommandAndAncestors().forEach((command) => command.emit("afterAllHelp", context));
      }
      /**
       * You can pass in flags and a description to override the help
       * flags and help description for your command. Pass in false to
       * disable the built-in help option.
       *
       * @param {string | boolean} [flags]
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          this._hasHelpOption = flags;
          return this;
        }
        this._helpFlags = flags || this._helpFlags;
        this._helpDescription = description || this._helpDescription;
        const helpFlags = splitOptionFlags(this._helpFlags);
        this._helpShortFlag = helpFlags.shortFlag;
        this._helpLongFlag = helpFlags.longFlag;
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = process2.exitCode || 0;
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {string | Function} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text === "function") {
            helpStr = text({ error: context.error, command: context.command });
          } else {
            helpStr = text;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
    };
    function outputHelpIfRequested(cmd, args) {
      const helpOption = cmd._hasHelpOption && args.find((arg) => arg === cmd._helpLongFlag || arg === cmd._helpShortFlag);
      if (helpOption) {
        cmd.outputHelp();
        cmd._exit(0, "commander.helpDisplayed", "(outputHelp)");
      }
    }
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    exports2.Command = Command2;
  }
});

// node_modules/commander/index.js
var require_commander = __commonJS({
  "node_modules/commander/index.js"(exports2, module2) {
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports2 = module2.exports = new Command2();
    exports2.program = exports2;
    exports2.Command = Command2;
    exports2.Option = Option2;
    exports2.Argument = Argument2;
    exports2.Help = Help2;
    exports2.CommanderError = CommanderError2;
    exports2.InvalidArgumentError = InvalidArgumentError2;
    exports2.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// src/translate.ts
var translate_exports = {};
__export(translate_exports, {
  translate: () => translate,
  translateDiff: () => translateDiff
});
module.exports = __toCommonJS(translate_exports);

// node_modules/@google/generative-ai/dist/index.mjs
var HarmCategory;
(function(HarmCategory2) {
  HarmCategory2["HARM_CATEGORY_UNSPECIFIED"] = "HARM_CATEGORY_UNSPECIFIED";
  HarmCategory2["HARM_CATEGORY_HATE_SPEECH"] = "HARM_CATEGORY_HATE_SPEECH";
  HarmCategory2["HARM_CATEGORY_SEXUALLY_EXPLICIT"] = "HARM_CATEGORY_SEXUALLY_EXPLICIT";
  HarmCategory2["HARM_CATEGORY_HARASSMENT"] = "HARM_CATEGORY_HARASSMENT";
  HarmCategory2["HARM_CATEGORY_DANGEROUS_CONTENT"] = "HARM_CATEGORY_DANGEROUS_CONTENT";
})(HarmCategory || (HarmCategory = {}));
var HarmBlockThreshold;
(function(HarmBlockThreshold2) {
  HarmBlockThreshold2["HARM_BLOCK_THRESHOLD_UNSPECIFIED"] = "HARM_BLOCK_THRESHOLD_UNSPECIFIED";
  HarmBlockThreshold2["BLOCK_LOW_AND_ABOVE"] = "BLOCK_LOW_AND_ABOVE";
  HarmBlockThreshold2["BLOCK_MEDIUM_AND_ABOVE"] = "BLOCK_MEDIUM_AND_ABOVE";
  HarmBlockThreshold2["BLOCK_ONLY_HIGH"] = "BLOCK_ONLY_HIGH";
  HarmBlockThreshold2["BLOCK_NONE"] = "BLOCK_NONE";
})(HarmBlockThreshold || (HarmBlockThreshold = {}));
var HarmProbability;
(function(HarmProbability2) {
  HarmProbability2["HARM_PROBABILITY_UNSPECIFIED"] = "HARM_PROBABILITY_UNSPECIFIED";
  HarmProbability2["NEGLIGIBLE"] = "NEGLIGIBLE";
  HarmProbability2["LOW"] = "LOW";
  HarmProbability2["MEDIUM"] = "MEDIUM";
  HarmProbability2["HIGH"] = "HIGH";
})(HarmProbability || (HarmProbability = {}));
var BlockReason;
(function(BlockReason2) {
  BlockReason2["BLOCKED_REASON_UNSPECIFIED"] = "BLOCKED_REASON_UNSPECIFIED";
  BlockReason2["SAFETY"] = "SAFETY";
  BlockReason2["OTHER"] = "OTHER";
})(BlockReason || (BlockReason = {}));
var FinishReason;
(function(FinishReason2) {
  FinishReason2["FINISH_REASON_UNSPECIFIED"] = "FINISH_REASON_UNSPECIFIED";
  FinishReason2["STOP"] = "STOP";
  FinishReason2["MAX_TOKENS"] = "MAX_TOKENS";
  FinishReason2["SAFETY"] = "SAFETY";
  FinishReason2["RECITATION"] = "RECITATION";
  FinishReason2["OTHER"] = "OTHER";
})(FinishReason || (FinishReason = {}));
var TaskType;
(function(TaskType2) {
  TaskType2["TASK_TYPE_UNSPECIFIED"] = "TASK_TYPE_UNSPECIFIED";
  TaskType2["RETRIEVAL_QUERY"] = "RETRIEVAL_QUERY";
  TaskType2["RETRIEVAL_DOCUMENT"] = "RETRIEVAL_DOCUMENT";
  TaskType2["SEMANTIC_SIMILARITY"] = "SEMANTIC_SIMILARITY";
  TaskType2["CLASSIFICATION"] = "CLASSIFICATION";
  TaskType2["CLUSTERING"] = "CLUSTERING";
})(TaskType || (TaskType = {}));
var GoogleGenerativeAIError = class extends Error {
  constructor(message) {
    super(`[GoogleGenerativeAI Error]: ${message}`);
  }
};
var GoogleGenerativeAIResponseError = class extends GoogleGenerativeAIError {
  constructor(message, response) {
    super(message);
    this.response = response;
  }
};
var BASE_URL = "https://generativelanguage.googleapis.com";
var API_VERSION = "v1";
var PACKAGE_VERSION = "0.2.0";
var PACKAGE_LOG_HEADER = "genai-js";
var Task;
(function(Task2) {
  Task2["GENERATE_CONTENT"] = "generateContent";
  Task2["STREAM_GENERATE_CONTENT"] = "streamGenerateContent";
  Task2["COUNT_TOKENS"] = "countTokens";
  Task2["EMBED_CONTENT"] = "embedContent";
  Task2["BATCH_EMBED_CONTENTS"] = "batchEmbedContents";
})(Task || (Task = {}));
var RequestUrl = class {
  constructor(model, task, apiKey, stream) {
    this.model = model;
    this.task = task;
    this.apiKey = apiKey;
    this.stream = stream;
  }
  toString() {
    let url = `${BASE_URL}/${API_VERSION}/models/${this.model}:${this.task}`;
    if (this.stream) {
      url += "?alt=sse";
    }
    return url;
  }
};
function getClientHeaders() {
  return `${PACKAGE_LOG_HEADER}/${PACKAGE_VERSION}`;
}
async function makeRequest(url, body, requestOptions) {
  let response;
  try {
    response = await fetch(url.toString(), Object.assign(Object.assign({}, buildFetchOptions(requestOptions)), { method: "POST", headers: {
      "Content-Type": "application/json",
      "x-goog-api-client": getClientHeaders(),
      "x-goog-api-key": url.apiKey
    }, body }));
    if (!response.ok) {
      let message = "";
      try {
        const json = await response.json();
        message = json.error.message;
        if (json.error.details) {
          message += ` ${JSON.stringify(json.error.details)}`;
        }
      } catch (e) {
      }
      throw new Error(`[${response.status} ${response.statusText}] ${message}`);
    }
  } catch (e) {
    const err = new GoogleGenerativeAIError(`Error fetching from ${url.toString()}: ${e.message}`);
    err.stack = e.stack;
    throw err;
  }
  return response;
}
function buildFetchOptions(requestOptions) {
  const fetchOptions = {};
  if ((requestOptions === null || requestOptions === void 0 ? void 0 : requestOptions.timeout) >= 0) {
    const abortController = new AbortController();
    const signal = abortController.signal;
    setTimeout(() => abortController.abort(), requestOptions.timeout);
    fetchOptions.signal = signal;
  }
  return fetchOptions;
}
function addHelpers(response) {
  response.text = () => {
    if (response.candidates && response.candidates.length > 0) {
      if (response.candidates.length > 1) {
        console.warn(`This response had ${response.candidates.length} candidates. Returning text from the first candidate only. Access response.candidates directly to use the other candidates.`);
      }
      if (hadBadFinishReason(response.candidates[0])) {
        throw new GoogleGenerativeAIResponseError(`${formatBlockErrorMessage(response)}`, response);
      }
      return getText(response);
    } else if (response.promptFeedback) {
      throw new GoogleGenerativeAIResponseError(`Text not available. ${formatBlockErrorMessage(response)}`, response);
    }
    return "";
  };
  return response;
}
function getText(response) {
  var _a, _b, _c, _d;
  if ((_d = (_c = (_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0].content) === null || _b === void 0 ? void 0 : _b.parts) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.text) {
    return response.candidates[0].content.parts[0].text;
  } else {
    return "";
  }
}
var badFinishReasons = [FinishReason.RECITATION, FinishReason.SAFETY];
function hadBadFinishReason(candidate) {
  return !!candidate.finishReason && badFinishReasons.includes(candidate.finishReason);
}
function formatBlockErrorMessage(response) {
  var _a, _b, _c;
  let message = "";
  if ((!response.candidates || response.candidates.length === 0) && response.promptFeedback) {
    message += "Response was blocked";
    if ((_a = response.promptFeedback) === null || _a === void 0 ? void 0 : _a.blockReason) {
      message += ` due to ${response.promptFeedback.blockReason}`;
    }
    if ((_b = response.promptFeedback) === null || _b === void 0 ? void 0 : _b.blockReasonMessage) {
      message += `: ${response.promptFeedback.blockReasonMessage}`;
    }
  } else if ((_c = response.candidates) === null || _c === void 0 ? void 0 : _c[0]) {
    const firstCandidate = response.candidates[0];
    if (hadBadFinishReason(firstCandidate)) {
      message += `Candidate was blocked due to ${firstCandidate.finishReason}`;
      if (firstCandidate.finishMessage) {
        message += `: ${firstCandidate.finishMessage}`;
      }
    }
  }
  return message;
}
function __await(v) {
  return this instanceof __await ? (this.v = v, this) : new __await(v);
}
function __asyncGenerator(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator)
    throw new TypeError("Symbol.asyncIterator is not defined.");
  var g = generator.apply(thisArg, _arguments || []), i, q = [];
  return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
    return this;
  }, i;
  function verb(n) {
    if (g[n])
      i[n] = function(v) {
        return new Promise(function(a, b) {
          q.push([n, v, a, b]) > 1 || resume(n, v);
        });
      };
  }
  function resume(n, v) {
    try {
      step(g[n](v));
    } catch (e) {
      settle(q[0][3], e);
    }
  }
  function step(r) {
    r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f, v) {
    if (f(v), q.shift(), q.length)
      resume(q[0][0], q[0][1]);
  }
}
var responseLineRE = /^data\: (.*)(?:\n\n|\r\r|\r\n\r\n)/;
function processStream(response) {
  const inputStream = response.body.pipeThrough(new TextDecoderStream("utf8", { fatal: true }));
  const responseStream = getResponseStream(inputStream);
  const [stream1, stream2] = responseStream.tee();
  return {
    stream: generateResponseSequence(stream1),
    response: getResponsePromise(stream2)
  };
}
async function getResponsePromise(stream) {
  const allResponses = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return addHelpers(aggregateResponses(allResponses));
    }
    allResponses.push(value);
  }
}
function generateResponseSequence(stream) {
  return __asyncGenerator(this, arguments, function* generateResponseSequence_1() {
    const reader = stream.getReader();
    while (true) {
      const { value, done } = yield __await(reader.read());
      if (done) {
        break;
      }
      yield yield __await(addHelpers(value));
    }
  });
}
function getResponseStream(inputStream) {
  const reader = inputStream.getReader();
  const stream = new ReadableStream({
    start(controller) {
      let currentText = "";
      return pump();
      function pump() {
        return reader.read().then(({ value, done }) => {
          if (done) {
            if (currentText.trim()) {
              controller.error(new GoogleGenerativeAIError("Failed to parse stream"));
              return;
            }
            controller.close();
            return;
          }
          currentText += value;
          let match = currentText.match(responseLineRE);
          let parsedResponse;
          while (match) {
            try {
              parsedResponse = JSON.parse(match[1]);
            } catch (e) {
              controller.error(new GoogleGenerativeAIError(`Error parsing JSON response: "${match[1]}"`));
              return;
            }
            controller.enqueue(parsedResponse);
            currentText = currentText.substring(match[0].length);
            match = currentText.match(responseLineRE);
          }
          return pump();
        });
      }
    }
  });
  return stream;
}
function aggregateResponses(responses) {
  const lastResponse = responses[responses.length - 1];
  const aggregatedResponse = {
    promptFeedback: lastResponse === null || lastResponse === void 0 ? void 0 : lastResponse.promptFeedback
  };
  for (const response of responses) {
    if (response.candidates) {
      for (const candidate of response.candidates) {
        const i = candidate.index;
        if (!aggregatedResponse.candidates) {
          aggregatedResponse.candidates = [];
        }
        if (!aggregatedResponse.candidates[i]) {
          aggregatedResponse.candidates[i] = {
            index: candidate.index
          };
        }
        aggregatedResponse.candidates[i].citationMetadata = candidate.citationMetadata;
        aggregatedResponse.candidates[i].finishReason = candidate.finishReason;
        aggregatedResponse.candidates[i].finishMessage = candidate.finishMessage;
        aggregatedResponse.candidates[i].safetyRatings = candidate.safetyRatings;
        if (candidate.content && candidate.content.parts) {
          if (!aggregatedResponse.candidates[i].content) {
            aggregatedResponse.candidates[i].content = {
              role: candidate.content.role || "user",
              parts: [{ text: "" }]
            };
          }
          for (const part of candidate.content.parts) {
            if (part.text) {
              aggregatedResponse.candidates[i].content.parts[0].text += part.text;
            }
          }
        }
      }
    }
  }
  return aggregatedResponse;
}
async function generateContentStream(apiKey, model, params, requestOptions) {
  const url = new RequestUrl(
    model,
    Task.STREAM_GENERATE_CONTENT,
    apiKey,
    /* stream */
    true
  );
  const response = await makeRequest(url, JSON.stringify(params), requestOptions);
  return processStream(response);
}
async function generateContent(apiKey, model, params, requestOptions) {
  const url = new RequestUrl(
    model,
    Task.GENERATE_CONTENT,
    apiKey,
    /* stream */
    false
  );
  const response = await makeRequest(url, JSON.stringify(params), requestOptions);
  const responseJson = await response.json();
  const enhancedResponse = addHelpers(responseJson);
  return {
    response: enhancedResponse
  };
}
function formatNewContent(request, role) {
  let newParts = [];
  if (typeof request === "string") {
    newParts = [{ text: request }];
  } else {
    for (const partOrString of request) {
      if (typeof partOrString === "string") {
        newParts.push({ text: partOrString });
      } else {
        newParts.push(partOrString);
      }
    }
  }
  return { role, parts: newParts };
}
function formatGenerateContentInput(params) {
  if (params.contents) {
    return params;
  } else {
    const content = formatNewContent(params, "user");
    return { contents: [content] };
  }
}
function formatEmbedContentInput(params) {
  if (typeof params === "string" || Array.isArray(params)) {
    const content = formatNewContent(params, "user");
    return { content };
  }
  return params;
}
var SILENT_ERROR = "SILENT_ERROR";
var ChatSession = class {
  constructor(apiKey, model, params, requestOptions) {
    this.model = model;
    this.params = params;
    this.requestOptions = requestOptions;
    this._history = [];
    this._sendPromise = Promise.resolve();
    this._apiKey = apiKey;
    if (params === null || params === void 0 ? void 0 : params.history) {
      this._history = params.history.map((content) => {
        if (!content.role) {
          throw new Error("Missing role for history item: " + JSON.stringify(content));
        }
        return formatNewContent(content.parts, content.role);
      });
    }
  }
  /**
   * Gets the chat history so far. Blocked prompts are not added to history.
   * Blocked candidates are not added to history, nor are the prompts that
   * generated them.
   */
  async getHistory() {
    await this._sendPromise;
    return this._history;
  }
  /**
   * Sends a chat message and receives a non-streaming
   * {@link GenerateContentResult}
   */
  async sendMessage(request) {
    var _a, _b;
    await this._sendPromise;
    const newContent = formatNewContent(request, "user");
    const generateContentRequest = {
      safetySettings: (_a = this.params) === null || _a === void 0 ? void 0 : _a.safetySettings,
      generationConfig: (_b = this.params) === null || _b === void 0 ? void 0 : _b.generationConfig,
      contents: [...this._history, newContent]
    };
    let finalResult;
    this._sendPromise = this._sendPromise.then(() => generateContent(this._apiKey, this.model, generateContentRequest, this.requestOptions)).then((result) => {
      var _a2;
      if (result.response.candidates && result.response.candidates.length > 0) {
        this._history.push(newContent);
        const responseContent = Object.assign({
          parts: [],
          // Response seems to come back without a role set.
          role: "model"
        }, (_a2 = result.response.candidates) === null || _a2 === void 0 ? void 0 : _a2[0].content);
        this._history.push(responseContent);
      } else {
        const blockErrorMessage = formatBlockErrorMessage(result.response);
        if (blockErrorMessage) {
          console.warn(`sendMessage() was unsuccessful. ${blockErrorMessage}. Inspect response object for details.`);
        }
      }
      finalResult = result;
    });
    await this._sendPromise;
    return finalResult;
  }
  /**
   * Sends a chat message and receives the response as a
   * {@link GenerateContentStreamResult} containing an iterable stream
   * and a response promise.
   */
  async sendMessageStream(request) {
    var _a, _b;
    await this._sendPromise;
    const newContent = formatNewContent(request, "user");
    const generateContentRequest = {
      safetySettings: (_a = this.params) === null || _a === void 0 ? void 0 : _a.safetySettings,
      generationConfig: (_b = this.params) === null || _b === void 0 ? void 0 : _b.generationConfig,
      contents: [...this._history, newContent]
    };
    const streamPromise = generateContentStream(this._apiKey, this.model, generateContentRequest, this.requestOptions);
    this._sendPromise = this._sendPromise.then(() => streamPromise).catch((_ignored) => {
      throw new Error(SILENT_ERROR);
    }).then((streamResult) => streamResult.response).then((response) => {
      if (response.candidates && response.candidates.length > 0) {
        this._history.push(newContent);
        const responseContent = Object.assign({}, response.candidates[0].content);
        if (!responseContent.role) {
          responseContent.role = "model";
        }
        this._history.push(responseContent);
      } else {
        const blockErrorMessage = formatBlockErrorMessage(response);
        if (blockErrorMessage) {
          console.warn(`sendMessageStream() was unsuccessful. ${blockErrorMessage}. Inspect response object for details.`);
        }
      }
    }).catch((e) => {
      if (e.message !== SILENT_ERROR) {
        console.error(e);
      }
    });
    return streamPromise;
  }
};
async function countTokens(apiKey, model, params, requestOptions) {
  const url = new RequestUrl(model, Task.COUNT_TOKENS, apiKey, false);
  const response = await makeRequest(url, JSON.stringify(Object.assign(Object.assign({}, params), { model })), requestOptions);
  return response.json();
}
async function embedContent(apiKey, model, params, requestOptions) {
  const url = new RequestUrl(model, Task.EMBED_CONTENT, apiKey, false);
  const response = await makeRequest(url, JSON.stringify(params), requestOptions);
  return response.json();
}
async function batchEmbedContents(apiKey, model, params, requestOptions) {
  const url = new RequestUrl(model, Task.BATCH_EMBED_CONTENTS, apiKey, false);
  const requestsWithModel = params.requests.map((request) => {
    return Object.assign(Object.assign({}, request), { model: `models/${model}` });
  });
  const response = await makeRequest(url, JSON.stringify({ requests: requestsWithModel }), requestOptions);
  return response.json();
}
var GenerativeModel = class {
  constructor(apiKey, modelParams, requestOptions) {
    var _a;
    this.apiKey = apiKey;
    if (modelParams.model.startsWith("models/")) {
      this.model = (_a = modelParams.model.split("models/")) === null || _a === void 0 ? void 0 : _a[1];
    } else {
      this.model = modelParams.model;
    }
    this.generationConfig = modelParams.generationConfig || {};
    this.safetySettings = modelParams.safetySettings || [];
    this.requestOptions = requestOptions || {};
  }
  /**
   * Makes a single non-streaming call to the model
   * and returns an object containing a single {@link GenerateContentResponse}.
   */
  async generateContent(request) {
    const formattedParams = formatGenerateContentInput(request);
    return generateContent(this.apiKey, this.model, Object.assign({ generationConfig: this.generationConfig, safetySettings: this.safetySettings }, formattedParams), this.requestOptions);
  }
  /**
   * Makes a single streaming call to the model
   * and returns an object containing an iterable stream that iterates
   * over all chunks in the streaming response as well as
   * a promise that returns the final aggregated response.
   */
  async generateContentStream(request) {
    const formattedParams = formatGenerateContentInput(request);
    return generateContentStream(this.apiKey, this.model, Object.assign({ generationConfig: this.generationConfig, safetySettings: this.safetySettings }, formattedParams), this.requestOptions);
  }
  /**
   * Gets a new {@link ChatSession} instance which can be used for
   * multi-turn chats.
   */
  startChat(startChatParams) {
    return new ChatSession(this.apiKey, this.model, startChatParams, this.requestOptions);
  }
  /**
   * Counts the tokens in the provided request.
   */
  async countTokens(request) {
    const formattedParams = formatGenerateContentInput(request);
    return countTokens(this.apiKey, this.model, formattedParams);
  }
  /**
   * Embeds the provided content.
   */
  async embedContent(request) {
    const formattedParams = formatEmbedContentInput(request);
    return embedContent(this.apiKey, this.model, formattedParams);
  }
  /**
   * Embeds an array of {@link EmbedContentRequest}s.
   */
  async batchEmbedContents(batchEmbedContentRequest) {
    return batchEmbedContents(this.apiKey, this.model, batchEmbedContentRequest, this.requestOptions);
  }
};
var GoogleGenerativeAI = class {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  /**
   * Gets a {@link GenerativeModel} instance for the provided model name.
   */
  getGenerativeModel(modelParams, requestOptions) {
    if (!modelParams.model) {
      throw new GoogleGenerativeAIError(`Must provide a model name. Example: genai.getGenerativeModel({ model: 'my-model-name' })`);
    }
    return new GenerativeModel(this.apiKey, modelParams, requestOptions);
  }
};

// src/translate.ts
var import_dotenv = __toESM(require_main());

// src/utils.ts
var import_iso_639_1 = __toESM(require_src());
function delay(delayDuration) {
  return new Promise((resolve) => setTimeout(resolve, delayDuration));
}
async function retryJob(job, jobArgs, maxRetries, firstTry, delayDuration, sendError = true) {
  if (!firstTry && delayDuration) {
    await delay(delayDuration);
  }
  return job(...jobArgs).catch((err) => {
    if (sendError) {
      console.error(`err = ${err}`);
    } else {
      console.warn(`err = ${err}`);
    }
    if (maxRetries <= 0) {
      throw err;
    }
    return retryJob(job, jobArgs, maxRetries - 1, false, delayDuration);
  });
}
function getLanguageCodeFromFilename(filename) {
  return filename.split(".")[0];
}
function getAllLanguageCodes() {
  return import_iso_639_1.default.getAllCodes();
}

// src/translate.ts
var import_flat = __toESM(require_flat());

// node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// src/translate.ts
var import_fs = __toESM(require("fs"));

// src/verify.ts
var translationVerificationPrompt = (inputLanguage, outputLanguage, input, output) => {
  const splitInput = input.split("\n");
  const splitOutput = output.split("\n");
  const mergedCsv = splitInput.map((x, i) => `${x},${splitOutput[i]}`).join("\n");
  return `
Given a translation from ${inputLanguage} to ${outputLanguage} in CSV form, reply with NAK if _any_ of the translations are poorly translated. Otherwise, reply with ACK. Only reply with ACK/NAK.

**Be as nitpicky as possible.** If even the smallest thing seems off, you should reply NAK.

\`\`\`
${inputLanguage},${outputLanguage}
${mergedCsv}
\`\`\`
`;
};
var stylingVerificationPrompt = (inputLanguage, outputLanguage, input, output) => {
  const splitInput = input.split("\n");
  const splitOutput = output.split("\n");
  const mergedCsv = splitInput.map((x, i) => `${x},${splitOutput[i]}`).join("\n");
  return `
Given text from ${inputLanguage} to ${outputLanguage} in CSV form, reply with NAK if _any_ of the translations do not match the formatting of the original. Check for differing capitalization, punctuation, or whitespaces. Otherwise, reply with ACK. Only reply with ACK/NAK.

**Be as nitpicky as possible.** If even the smallest thing seems off, you should reply NAK.

\`\`\`
${inputLanguage},${outputLanguage}
${mergedCsv}
\`\`\`
`;
};
async function verifyTranslation(chat, inputLanguage, outputLanguage, input, outputToVerify) {
  const translationVerificationPromptText = translationVerificationPrompt(
    inputLanguage,
    outputLanguage,
    input,
    outputToVerify
  );
  return verify(chat, translationVerificationPromptText);
}
async function verifyStyling(chat, inputLanguage, outputLanguage, input, outputToVerify) {
  const stylingVerificationPromptText = stylingVerificationPrompt(
    inputLanguage,
    outputLanguage,
    input,
    outputToVerify
  );
  return verify(chat, stylingVerificationPromptText);
}
var verify = async (chat, verificationPromptText) => {
  let verification = "";
  try {
    verification = await retryJob(
      async () => {
        const generatedContent = await chat.sendMessage(
          verificationPromptText
        );
        const text = generatedContent.response.text();
        if (text === "") {
          return Promise.reject(
            new Error("Failed to generate content")
          );
        }
        if (text !== "ACK" && text !== "NAK") {
          return Promise.reject(new Error("Invalid response"));
        }
        return text;
      },
      [],
      5,
      true,
      500,
      false
    );
  } catch (e) {
    console.error(`Failed to verify: ${e}`);
  }
  return verification;
};

// src/generate.ts
var generationPrompt = (inputLanguage, outputLanguage, input) => `You are a professional translator.

Translate each line from ${inputLanguage} to ${outputLanguage}.

Return translations in the same text formatting.

Maintain case sensitivity and whitespacing.

Output only the translations.

All lines should start and end with a quotation mark (").

\`\`\`
${input}
\`\`\`
`;
var failedTranslationPrompt = (inputLanguage, outputLanguage, input) => `You are a professional translator. The following translation from ${inputLanguage} to ${outputLanguage} failed. Attempt to translate it to ${outputLanguage} by considering it as a concatenation of ${inputLanguage} words, or re-interpreting it such that it makes sense in ${outputLanguage}. Return only the translation with no additional formatting, apart from returning it in quotes. Maintain case sensitivity and whitespacing.

\`\`\`
${input}
\`\`\`
`;
async function generateTranslation(model, chats, successfulHistory, inputLanguage, outputLanguage, input, keys, templatedStringPrefix, templatedStringSuffix, verboseLogging, ensureChangedTranslation) {
  const generationPromptText = generationPrompt(
    inputLanguage,
    outputLanguage,
    input
  );
  const templatedStringRegex = `/${templatedStringPrefix}[^{}]+${templatedStringSuffix}/g`;
  const inputLineToTemplatedString = {};
  const splitInput = input.split("\n");
  for (let i = 0; i < splitInput.length; i++) {
    const match = splitInput[i].match(templatedStringRegex);
    if (match) {
      inputLineToTemplatedString[i] = match;
    }
  }
  const fixedTranslationMappings = {};
  const translationToRetryAttempts = {};
  let generationRetries = 0;
  let translated = "";
  try {
    translated = await retryJob(
      async () => {
        let lastGeminiCall = Date.now();
        let generatedContent;
        let text = "";
        try {
          generatedContent = await chats.generateTranslationChat.sendMessage(
            generationPromptText
          );
          text = generatedContent.response.text();
        } catch (err) {
          generationRetries++;
          console.error(
            `Gemini exception encountered. err = ${JSON.stringify(generatedContent?.response, null, 4)}`
          );
          if (generationRetries > 10) {
            successfulHistory.history = [];
            chats.generateTranslationChat = model.startChat();
            return Promise.reject(
              new Error(
                `Failed to generate content due to exception. Resetting history. err = ${err}`
              )
            );
          }
          console.error(`Erroring text = ${input}`);
          chats.generateTranslationChat = model.startChat(successfulHistory);
          return Promise.reject(
            new Error(
              `Failed to generate content due to exception. err = ${err}`
            )
          );
        }
        if (text === "") {
          return Promise.reject(
            new Error(
              "Failed to generate content due to empty response"
            )
          );
        }
        generationRetries = 0;
        const splitText = text.split("\n");
        if (splitText.length !== keys.length) {
          chats.generateTranslationChat = model.startChat(successfulHistory);
          return Promise.reject(
            new Error(`Invalid number of lines. text = ${text}`)
          );
        }
        for (const i in inputLineToTemplatedString) {
          if (Object.prototype.hasOwnProperty.call(
            inputLineToTemplatedString,
            i
          )) {
            for (const templatedString of inputLineToTemplatedString[i]) {
              if (!splitText[i].includes(templatedString)) {
                chats.generateTranslationChat = model.startChat(successfulHistory);
                return Promise.reject(
                  new Error(
                    `Missing templated string: ${templatedString}`
                  )
                );
              }
            }
          }
        }
        for (let i = 0; i < splitText.length; i++) {
          let line = splitText[i];
          while (line.startsWith('""') && line.endsWith('""')) {
            line = line.slice(1, -1);
          }
          splitText[i] = line;
        }
        text = splitText.join("\n");
        for (let i = 0; i < splitText.length; i++) {
          let line = splitText[i];
          if (!line.startsWith('"') || !line.endsWith('"')) {
            chats.generateTranslationChat = model.startChat(successfulHistory);
            return Promise.reject(
              new Error(`Invalid line: ${line}`)
            );
          } else if (ensureChangedTranslation && line === splitInput[i] && line.length > 4) {
            if (translationToRetryAttempts[line] === void 0) {
              translationToRetryAttempts[line] = 0;
            } else if (fixedTranslationMappings[line]) {
              splitText[i] = fixedTranslationMappings[line];
              continue;
            }
            await delay(1e3 - (Date.now() - lastGeminiCall));
            lastGeminiCall = Date.now();
            const retryTranslationPromptText = failedTranslationPrompt(
              inputLanguage,
              outputLanguage,
              line
            );
            let fixedText = "";
            try {
              generatedContent = // eslint-disable-next-line no-await-in-loop
              await chats.generateTranslationChat.sendMessage(
                retryTranslationPromptText
              );
              fixedText = generatedContent.response.text();
            } catch (err) {
              console.error(
                JSON.stringify(
                  generatedContent?.response,
                  null,
                  4
                )
              );
              chats.generateTranslationChat = model.startChat(successfulHistory);
              return Promise.reject(
                new Error(
                  `Failed to generate content due to exception. err = ${err}`
                )
              );
            }
            const oldText = line;
            splitText[i] = fixedText;
            line = fixedText;
            for (const j in inputLineToTemplatedString[i]) {
              if (!splitText[i].includes(
                inputLineToTemplatedString[i][j]
              )) {
                chats.generateTranslationChat = model.startChat(successfulHistory);
                return Promise.reject(
                  new Error(
                    `Missing templated string: ${inputLineToTemplatedString[i][j]}`
                  )
                );
              }
            }
            if (!line.startsWith('"') || !line.endsWith('"')) {
              chats.generateTranslationChat = model.startChat(successfulHistory);
              return Promise.reject(
                new Error(`Invalid line: ${line}`)
              );
            }
            while (line.startsWith('""') && line.endsWith('""')) {
              line = line.slice(1, -1);
            }
            if (line !== splitInput[i]) {
              if (verboseLogging) {
                console.log(
                  `Successfully translated: ${oldText} => ${line}`
                );
              }
              text = splitText.join("\n");
              fixedTranslationMappings[oldText] = line;
              continue;
            }
            translationToRetryAttempts[line]++;
            if (translationToRetryAttempts[line] < 3) {
              chats.generateTranslationChat = model.startChat(successfulHistory);
              return Promise.reject(
                new Error(`No translation: ${line}`)
              );
            }
          }
        }
        await delay(1e3 - (Date.now() - lastGeminiCall));
        lastGeminiCall = Date.now();
        const translationVerification = await verifyTranslation(
          chats.verifyTranslationChat,
          inputLanguage,
          outputLanguage,
          input,
          text
        );
        if (translationVerification === "NAK") {
          chats.generateTranslationChat = model.startChat(successfulHistory);
          return Promise.reject(
            new Error(`Invalid translation. text = ${text}`)
          );
        }
        await delay(1e3 - (Date.now() - lastGeminiCall));
        lastGeminiCall = Date.now();
        const stylingVerification = await verifyStyling(
          chats.verifyStylingChat,
          inputLanguage,
          outputLanguage,
          input,
          text
        );
        if (stylingVerification === "NAK") {
          chats.generateTranslationChat = model.startChat(successfulHistory);
          return Promise.reject(
            new Error(`Invalid styling. text = ${text}`)
          );
        }
        successfulHistory.history.push(
          { role: "user", parts: generationPromptText },
          { role: "model", parts: text }
        );
        return text;
      },
      [],
      50,
      true,
      1e3,
      false
    );
  } catch (e) {
    console.error(`Failed to translate: ${e}`);
  }
  return translated;
}

// src/translate.ts
var import_path = __toESM(require("path"));
var BATCH_SIZE = 32;
var DEFAULT_TEMPLATED_STRING_PREFIX = "{{";
var DEFAULT_TEMPLATED_STRING_SUFFIX = "}}";
(0, import_dotenv.config)({ path: import_path.default.resolve(process.cwd(), ".env") });
async function translateDiff(options) {
  const flatInputBefore = (0, import_flat.flatten)(options.inputJSONBefore);
  const flatInputAfter = (0, import_flat.flatten)(options.inputJSONAfter);
  const flatToUpdateJSONs = {};
  for (const lang in options.toUpdateJSONs) {
    if (Object.prototype.hasOwnProperty.call(options.toUpdateJSONs, lang)) {
      const flatToUpdateJSON = (0, import_flat.flatten)(options.toUpdateJSONs[lang]);
      flatToUpdateJSONs[lang] = flatToUpdateJSON;
    }
  }
  const addedKeys = [];
  const modifiedKeys = [];
  const deletedKeys = [];
  for (const key in flatInputBefore) {
    if (flatInputBefore[key] !== flatInputAfter[key]) {
      if (flatInputAfter[key] === void 0) {
        deletedKeys.push(key);
      } else {
        modifiedKeys.push(key);
      }
    }
  }
  for (const key in flatInputAfter) {
    if (flatInputBefore[key] === void 0) {
      addedKeys.push(key);
    }
  }
  if (options.verbose) {
    console.log(`Added keys: ${addedKeys.join("\n")}
`);
    console.log(`Modified keys: ${modifiedKeys.join("\n")}
`);
    console.log(`Deleted keys: ${deletedKeys.join("\n")}
`);
  }
  for (const key of deletedKeys) {
    for (const lang in flatToUpdateJSONs) {
      if (Object.prototype.hasOwnProperty.call(flatToUpdateJSONs, lang)) {
        delete flatToUpdateJSONs[lang][key];
      }
    }
  }
  for (const languageCode in flatToUpdateJSONs) {
    if (Object.prototype.hasOwnProperty.call(
      flatToUpdateJSONs,
      languageCode
    )) {
      const addedAndModifiedTranslations = {};
      for (const key of addedKeys) {
        addedAndModifiedTranslations[key] = flatInputAfter[key];
      }
      for (const key of modifiedKeys) {
        addedAndModifiedTranslations[key] = flatInputAfter[key];
      }
      const translated = await translate({
        apiKey: options.apiKey,
        inputJSON: addedAndModifiedTranslations,
        inputLanguage: options.inputLanguage,
        outputLanguage: languageCode,
        templatedStringPrefix: options.templatedStringPrefix,
        templatedStringSuffix: options.templatedStringSuffix,
        verbose: options.verbose
      });
      const flatTranslated = (0, import_flat.flatten)(translated);
      for (const key in flatTranslated) {
        if (Object.prototype.hasOwnProperty.call(flatTranslated, key)) {
          flatToUpdateJSONs[languageCode][key] = flatTranslated[key];
        }
      }
    }
  }
  const unflatToUpdateJSONs = {};
  for (const lang in flatToUpdateJSONs) {
    if (Object.prototype.hasOwnProperty.call(flatToUpdateJSONs, lang)) {
      unflatToUpdateJSONs[lang] = (0, import_flat.unflatten)(flatToUpdateJSONs[lang]);
    }
  }
  if (options.verbose) {
    console.log("Updated JSONs:");
    console.log(unflatToUpdateJSONs);
  }
  return unflatToUpdateJSONs;
}
async function translate(options) {
  if (options.verbose) {
    console.log(
      `Translating from ${options.inputLanguage} to ${options.outputLanguage}...`
    );
  }
  const genAI = new GoogleGenerativeAI(options.apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const successfulHistory = { history: [] };
  const chats = {
    generateTranslationChat: model.startChat(),
    verifyTranslationChat: model.startChat(),
    verifyStylingChat: model.startChat()
  };
  const output = {};
  const templatedStringPrefix = options.templatedStringPrefix || DEFAULT_TEMPLATED_STRING_PREFIX;
  const templatedStringSuffix = options.templatedStringSuffix || DEFAULT_TEMPLATED_STRING_SUFFIX;
  const flatInput = (0, import_flat.flatten)(options.inputJSON);
  for (const key in flatInput) {
    if (Object.prototype.hasOwnProperty.call(flatInput, key)) {
      flatInput[key] = flatInput[key].replaceAll(
        "\\n",
        `${templatedStringPrefix}NEWLINE${templatedStringSuffix}`
      );
    }
  }
  const allKeys = Object.keys(flatInput);
  for (let i = allKeys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allKeys[i], allKeys[j]] = [allKeys[j], allKeys[i]];
  }
  const batchStartTime = Date.now();
  for (let i = 0; i < Object.keys(flatInput).length; i += BATCH_SIZE) {
    if (i > 0 && options.verbose) {
      console.log(
        `Completed ${(i / Object.keys(flatInput).length * 100).toFixed(0)}%`
      );
      console.log(
        `Estimated time left: ${((Date.now() - batchStartTime) / (i + 1) * (Object.keys(flatInput).length - i) / 6e4).toFixed(0)} minutes`
      );
    }
    const keys = allKeys.slice(i, i + BATCH_SIZE);
    const input = keys.map((x) => `"${flatInput[x]}"`).join("\n");
    const generatedTranslation = await generateTranslation(
      model,
      chats,
      successfulHistory,
      `[${options.inputLanguage}]`,
      `[${options.outputLanguage}]`,
      input,
      keys,
      templatedStringPrefix,
      templatedStringSuffix,
      options.verbose ?? false,
      options.ensureChangedTranslation ?? false
    );
    if (generatedTranslation === "") {
      console.error(
        `Failed to generate translation for ${options.inputLanguage}`
      );
      break;
    }
    for (let j = 0; j < keys.length; j++) {
      output[keys[j]] = generatedTranslation.split("\n")[j].slice(1, -1);
      if (options.verbose)
        console.log(
          `${keys[j]}:
${flatInput[keys[j]]}
=>
${output[keys[j]]}
`
        );
    }
    const batchEndTime = Date.now();
    if (batchEndTime - batchStartTime < 3e3) {
      if (options.verbose) {
        console.log(
          `Waiting for ${3e3 - (batchEndTime - batchStartTime)}ms...`
        );
      }
      await delay(3e3 - (batchEndTime - batchStartTime));
    }
  }
  const sortedOutput = {};
  for (const key of Object.keys(flatInput).sort()) {
    sortedOutput[key] = output[key];
  }
  for (const key in sortedOutput) {
    if (Object.prototype.hasOwnProperty.call(sortedOutput, key)) {
      sortedOutput[key] = sortedOutput[key].replaceAll(
        `${templatedStringPrefix}NEWLINE${templatedStringSuffix}`,
        "\\n"
      );
    }
  }
  const unflattenedOutput = (0, import_flat.unflatten)(sortedOutput);
  if (options.verbose) {
    const endTime = Date.now();
    console.log(
      `Actual execution time: ${(endTime - batchStartTime) / 6e4} minutes`
    );
  }
  return unflattenedOutput;
}
var translateFile = async (options) => {
  const jsonFolder = import_path.default.resolve(process.cwd(), "jsons");
  let inputPath;
  if (import_path.default.isAbsolute(options.inputFileOrPath)) {
    inputPath = import_path.default.resolve(options.inputFileOrPath);
  } else {
    inputPath = import_path.default.resolve(jsonFolder, options.inputFileOrPath);
    if (!import_fs.default.existsSync(inputPath)) {
      inputPath = import_path.default.resolve(process.cwd(), options.inputFileOrPath);
    }
  }
  let outputPath;
  if (import_path.default.isAbsolute(options.outputFileOrPath)) {
    outputPath = import_path.default.resolve(options.outputFileOrPath);
  } else {
    outputPath = import_path.default.resolve(jsonFolder, options.outputFileOrPath);
    if (!import_fs.default.existsSync(jsonFolder)) {
      outputPath = import_path.default.resolve(process.cwd(), options.outputFileOrPath);
    }
  }
  let inputJSON = {};
  try {
    const inputFile = import_fs.default.readFileSync(inputPath, "utf-8");
    inputJSON = JSON.parse(inputFile);
  } catch (e) {
    console.error(`Invalid input JSON: ${e}`);
    return;
  }
  const inputLanguage = getLanguageCodeFromFilename(options.inputFileOrPath);
  if (!inputLanguage) {
    throw new Error(
      "Invalid input file name. Use a valid ISO 639-1 language code as the file name."
    );
  }
  let outputLanguage = "";
  if (options.forceLanguageName) {
    outputLanguage = options.forceLanguageName;
  } else {
    const language = getLanguageCodeFromFilename(options.outputFileOrPath);
    if (!language) {
      throw new Error(
        "Invalid output file name. Use a valid ISO 639-1 language code as the file name. Consider using the --force-language option."
      );
    }
    outputLanguage = language;
  }
  try {
    const outputJSON = await translate({
      apiKey: options.apiKey,
      inputJSON,
      inputLanguage,
      outputLanguage,
      templatedStringPrefix: options.templatedStringPrefix,
      templatedStringSuffix: options.templatedStringSuffix,
      verbose: options.verbose
    });
    const outputText = JSON.stringify(outputJSON, null, 4);
    if (options.verbose) {
      console.log(outputText);
    }
    import_fs.default.writeFileSync(outputPath, outputText);
  } catch (err) {
    console.error(`Failed to translate file to ${outputLanguage}: ${err}`);
  }
};
var translateFileDiff = async (options) => {
  const jsonFolder = import_path.default.resolve(process.cwd(), "jsons");
  let inputBeforePath;
  let inputAfterPath;
  if (import_path.default.isAbsolute(options.inputBeforeFileOrPath)) {
    inputBeforePath = import_path.default.resolve(options.inputBeforeFileOrPath);
  } else {
    inputBeforePath = import_path.default.resolve(
      jsonFolder,
      options.inputBeforeFileOrPath
    );
    if (!import_fs.default.existsSync(inputBeforePath)) {
      inputBeforePath = import_path.default.resolve(
        process.cwd(),
        options.inputBeforeFileOrPath
      );
    }
  }
  if (import_path.default.isAbsolute(options.inputAfterFileOrPath)) {
    inputAfterPath = import_path.default.resolve(options.inputAfterFileOrPath);
  } else {
    inputAfterPath = import_path.default.resolve(jsonFolder, options.inputAfterFileOrPath);
  }
  const outputPaths = [];
  for (const outputFileOrPath of options.outputFilesOrPaths) {
    let outputPath;
    if (import_path.default.isAbsolute(outputFileOrPath)) {
      outputPath = import_path.default.resolve(outputFileOrPath);
    } else {
      outputPath = import_path.default.resolve(jsonFolder, outputFileOrPath);
      if (!import_fs.default.existsSync(jsonFolder)) {
        outputPath = import_path.default.resolve(process.cwd(), outputFileOrPath);
      }
    }
    outputPaths.push(outputPath);
  }
  let inputBeforeJSON = {};
  let inputAfterJSON = {};
  try {
    let inputFile = import_fs.default.readFileSync(inputBeforePath, "utf-8");
    inputBeforeJSON = JSON.parse(inputFile);
    inputFile = import_fs.default.readFileSync(inputAfterPath, "utf-8");
    inputAfterJSON = JSON.parse(inputFile);
  } catch (e) {
    console.error(`Invalid input JSON: ${e}`);
    return;
  }
  const toUpdateJSONs = {};
  for (const outputPath of outputPaths) {
    const languageCode = getLanguageCodeFromFilename(
      import_path.default.basename(outputPath)
    );
    if (!languageCode) {
      throw new Error(
        "Invalid output file name. Use a valid ISO 639-1 language code as the file name."
      );
    }
    try {
      const outputFile = import_fs.default.readFileSync(outputPath, "utf-8");
      toUpdateJSONs[languageCode] = JSON.parse(outputFile);
    } catch (e) {
      console.error(`Invalid output JSON: ${e}`);
    }
  }
  try {
    const outputJSON = await translateDiff({
      apiKey: options.apiKey,
      inputLanguage: options.inputLanguage,
      inputJSONBefore: inputBeforeJSON,
      inputJSONAfter: inputAfterJSON,
      toUpdateJSONs,
      templatedStringPrefix: options.templatedStringPrefix,
      templatedStringSuffix: options.templatedStringSuffix,
      verbose: options.verbose
    });
    for (const language in outputJSON) {
      if (Object.prototype.hasOwnProperty.call(outputJSON, language)) {
        const outputText = JSON.stringify(
          outputJSON[language],
          null,
          4
        );
        if (options.verbose) {
          console.log(outputText);
        }
        import_fs.default.writeFileSync(
          import_path.default.resolve(jsonFolder, `${language}.json`),
          outputText
        );
      }
    }
  } catch (err) {
    console.error(`Failed to translate file diff: ${err}`);
  }
};
program.name("i18n-ai-translate").description(
  "Use Google Gemini to translate your i18n JSON to any language"
).version("1.1.0");
program.command("translate").requiredOption(
  "-i, --input <input>",
  "Source i18n file, in the jsons/ directory if a relative path is given"
).option(
  "-o, --output <output>",
  "Output i18n file, in the jsons/ directory if a relative path is given"
).option("-f, --force-language-name <language name>", "Force language name").option("-A, --all-languages", "Translate to all supported languages").option(
  "-l, --languages [language codes...]",
  "Pass a list of languages to translate to"
).option(
  "-p, --templated-string-prefix <prefix>",
  "Prefix for templated strings",
  DEFAULT_TEMPLATED_STRING_PREFIX
).option(
  "-s, --templated-string-suffix <suffix>",
  "Suffix for templated strings",
  DEFAULT_TEMPLATED_STRING_SUFFIX
).option("-k, --api-key <Gemini API key>", "Gemini API key").option(
  "--ensure-changed-translation",
  "Each generated translation key must differ from the input (for keys longer than 4)",
  false
).option("--verbose", "Print logs about progress", false).action(async (options) => {
  if (!process.env.API_KEY && !options.apiKey) {
    console.error("API_KEY not found in .env file");
    return;
  }
  const apiKey = options.apiKey || process.env.API_KEY;
  if (!options.allLanguages && !options.languages) {
    if (!options.output) {
      console.error("Output file not specified");
      return;
    }
    await translateFile({
      apiKey,
      inputFileOrPath: options.input,
      outputFileOrPath: options.output,
      forceLanguageName: options.forceLanguageName,
      templatedStringPrefix: options.templatedStringPrefix,
      templatedStringSuffix: options.templatedStringSuffix,
      verbose: options.verbose
    });
  } else if (options.languages) {
    if (options.forceLanguageName) {
      console.error(
        "Cannot use both --languages and --force-language"
      );
      return;
    }
    if (options.allLanguages) {
      console.error(
        "Cannot use both --all-languages and --languages"
      );
      return;
    }
    if (options.languages.length === 0) {
      console.error("No languages specified");
      return;
    }
    if (options.verbose) {
      console.log(
        `Translating to ${options.languages.join(", ")}...`
      );
    }
    let i = 0;
    for (const languageCode of options.languages) {
      i++;
      console.log(
        `Translating ${i}/${options.languages.length} languages...`
      );
      const output = options.input.replace(
        getLanguageCodeFromFilename(options.input),
        languageCode
      );
      if (options.input === output) {
        continue;
      }
      try {
        await translateFile({
          apiKey,
          inputFileOrPath: options.input,
          outputFileOrPath: output,
          templatedStringPrefix: options.templatedStringPrefix,
          templatedStringSuffix: options.templatedStringSuffix,
          verbose: options.verbose
        });
      } catch (err) {
        console.error(
          `Failed to translate to ${languageCode}: ${err}`
        );
      }
    }
  } else {
    if (options.forceLanguageName) {
      console.error(
        "Cannot use both --all-languages and --force-language"
      );
      return;
    }
    console.warn(
      "Some languages may fail to translate due to the model's limitations"
    );
    let i = 0;
    for (const languageCode of getAllLanguageCodes()) {
      i++;
      if (options.verbose) {
        console.log(
          `Translating ${i}/${getAllLanguageCodes().length} languages...`
        );
      }
      const output = options.input.replace(
        getLanguageCodeFromFilename(options.input),
        languageCode
      );
      if (options.input === output) {
        continue;
      }
      try {
        await translateFile({
          apiKey,
          inputFileOrPath: options.input,
          outputFileOrPath: output,
          templatedStringPrefix: options.templatedStringPrefix,
          templatedStringSuffix: options.templatedStringSuffix,
          verbose: options.verbose
        });
      } catch (err) {
        console.error(
          `Failed to translate to ${languageCode}: ${err}`
        );
      }
    }
  }
});
program.command("diff").requiredOption(
  "-b, --before <fileBefore>",
  "Source i18n file before changes, in the jsons/ directory if a relative path is given"
).requiredOption(
  "-a, --after <fileAfter>",
  "Source i18n file after changes, in the jsons/ directory if a relative path is given"
).requiredOption(
  "-l, --input-language <inputLanguage>",
  "The full input language name"
).option("-k, --api-key <Gemini API key>", "Gemini API key").option(
  "--ensure-changed-translation",
  "Each generated translation key must differ from the input (for keys longer than 4)",
  false
).option("--verbose", "Print logs about progress", false).action(async (options) => {
  if (!process.env.API_KEY && !options.apiKey) {
    console.error("API_KEY not found in .env file");
    return;
  }
  const apiKey = options.apiKey || process.env.API_KEY;
  const jsonFolder = import_path.default.resolve(process.cwd(), "jsons");
  let beforeInputPath;
  if (import_path.default.isAbsolute(options.before)) {
    beforeInputPath = import_path.default.resolve(options.before);
  } else {
    beforeInputPath = import_path.default.resolve(jsonFolder, options.before);
    if (!import_fs.default.existsSync(beforeInputPath)) {
      beforeInputPath = import_path.default.resolve(process.cwd(), options.before);
    }
  }
  let afterInputPath;
  if (import_path.default.isAbsolute(options.after)) {
    afterInputPath = import_path.default.resolve(options.after);
  } else {
    afterInputPath = import_path.default.resolve(jsonFolder, options.after);
    if (!import_fs.default.existsSync(afterInputPath)) {
      afterInputPath = import_path.default.resolve(process.cwd(), options.after);
    }
  }
  if (import_path.default.dirname(beforeInputPath) !== import_path.default.dirname(afterInputPath)) {
    console.error("Input files are not in the same directory");
    return;
  }
  const outputFilesOrPaths = import_fs.default.readdirSync(import_path.default.dirname(beforeInputPath)).filter((file) => file.endsWith(".json")).filter(
    (file) => file !== import_path.default.basename(beforeInputPath) && file !== import_path.default.basename(afterInputPath)
  ).map((file) => import_path.default.resolve(import_path.default.dirname(beforeInputPath), file));
  await translateFileDiff({
    apiKey,
    inputLanguage: options.inputLanguage,
    inputBeforeFileOrPath: beforeInputPath,
    inputAfterFileOrPath: afterInputPath,
    outputFilesOrPaths,
    templatedStringPrefix: options.templatedStringPrefix,
    templatedStringSuffix: options.templatedStringSuffix,
    verbose: options.verbose
  });
});
program.parse();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  translate,
  translateDiff
});
/*! Bundled license information:

@google/generative-ai/dist/index.mjs:
  (**
   * @license
   * Copyright 2023 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)

@google/generative-ai/dist/index.mjs:
  (**
   * @license
   * Copyright 2023 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
*/
