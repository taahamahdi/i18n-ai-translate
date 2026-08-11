import {
    getAdapterByExtension,
    getAdapterByName,
    getAdapterForFile,
    listFormatNames,
} from "../formats/registry";
import { po } from "gettext-parser";
import JSONAdapter from "../formats/json_adapter";
import POAdapter from "../formats/po_adapter";
import PropertiesAdapter from "../formats/properties_adapter";
import StringsAdapter from "../formats/strings_adapter";
import TypeScriptAdapter, {
    JavaScriptAdapter,
} from "../formats/module_adapter";
import YAMLAdapter from "../formats/yaml_adapter";

// ASCII Record Separator — must match KEY_DELIMITER in po_adapter.ts.
const SEP = "\x1e";

const PO_FIXTURE = [
    "msgid \"\"",
    "msgstr \"\"",
    "\"Content-Type: text/plain; charset=UTF-8\\n\"",
    "\"Plural-Forms: nplurals=2; plural=(n != 1);\\n\"",
    "\"Language: en\\n\"",
    "",
    "# translator comment",
    "#. extracted comment",
    "#: src/app.js:42",
    "#, javascript-format",
    "msgid \"Hello %s\"",
    "msgstr \"\"",
    "",
    "msgctxt \"menu\"",
    "msgid \"Save\"",
    "msgstr \"\"",
    "",
    "msgid \"One item\"",
    "msgid_plural \"%d items\"",
    "msgstr[0] \"\"",
    "msgstr[1] \"\"",
    "",
].join("\n");

describe("format registry", () => {
    it("resolves the JSON adapter by name", () => {
        expect(getAdapterByName("json")).toBe(JSONAdapter);
    });

    it("resolves the JSON adapter by extension (dot or bare)", () => {
        expect(getAdapterByExtension(".json")).toBe(JSONAdapter);
        expect(getAdapterByExtension("JSON")).toBe(JSONAdapter);
    });

    it("resolves the PO adapter by name and extension", () => {
        expect(getAdapterByName("po")).toBe(POAdapter);
        expect(getAdapterByExtension(".po")).toBe(POAdapter);
        expect(getAdapterForFile("en.po")).toBe(POAdapter);
    });

    it("falls back to JSONAdapter for unknown extensions", () => {
        expect(getAdapterForFile("en.xyz")).toBe(JSONAdapter);
    });

    it("returns undefined for an unknown name", () => {
        expect(getAdapterByName("nope")).toBeUndefined();
    });

    it("resolves the properties adapter by name and extension", () => {
        expect(getAdapterByName("properties")).toBe(PropertiesAdapter);
        expect(getAdapterByExtension(".properties")).toBe(PropertiesAdapter);
        expect(getAdapterForFile("messages.properties")).toBe(
            PropertiesAdapter,
        );
    });

    it("resolves the strings adapter by name and extension", () => {
        expect(getAdapterByName("strings")).toBe(StringsAdapter);
        expect(getAdapterByExtension(".strings")).toBe(StringsAdapter);
        expect(getAdapterForFile("Localizable.strings")).toBe(StringsAdapter);
    });

    it("resolves the YAML adapter by name and both extensions", () => {
        expect(getAdapterByName("yaml")).toBe(YAMLAdapter);
        expect(getAdapterByExtension(".yml")).toBe(YAMLAdapter);
        expect(getAdapterByExtension(".yaml")).toBe(YAMLAdapter);
        expect(getAdapterForFile("en.yml")).toBe(YAMLAdapter);
    });

    it("resolves the module adapters by name and extension", () => {
        expect(getAdapterByName("ts")).toBe(TypeScriptAdapter);
        expect(getAdapterByName("js")).toBe(JavaScriptAdapter);
        expect(getAdapterForFile("en.ts")).toBe(TypeScriptAdapter);
        expect(getAdapterForFile("en.mts")).toBe(TypeScriptAdapter);
        expect(getAdapterForFile("en.js")).toBe(JavaScriptAdapter);
        expect(getAdapterForFile("en.cjs")).toBe(JavaScriptAdapter);
    });

    it("lists registered format names", () => {
        expect(listFormatNames()).toEqual([
            "json",
            "po",
            "properties",
            "strings",
            "yaml",
            "ts",
            "js",
        ]);
    });
});

describe("JSONAdapter", () => {
    it("round-trips an i18next nested object byte-for-byte", () => {
        const input = `${JSON.stringify(
            { a: { b: "hi" }, c: "there" },
            null,
            4,
        )}\n`;

        const { flat, sidecar } = JSONAdapter.read(input);
        expect(flat).toEqual({ "a*b": "hi", c: "there" });

        const output = JSONAdapter.write(flat, sidecar, "en", "en");
        expect(output).toBe(input);
    });

    it("preserves keys containing dots via the custom delimiter", () => {
        const input = `${JSON.stringify({ "foo.bar": "x" }, null, 4)}\n`;

        const { flat, sidecar } = JSONAdapter.read(input);
        expect(flat).toEqual({ "foo.bar": "x" });

        const output = JSONAdapter.write(flat, sidecar, "en", "en");
        expect(output).toBe(input);
    });
});

describe("POAdapter", () => {
    it("reads singular, context, and plural entries into flat keys", () => {
        const { flat } = POAdapter.read(PO_FIXTURE);

        // Singular entry keyed by (empty ctx, msgid); placeholder stripped.
        expect(flat[`${SEP}Hello %s`]).toBe("Hello {{arg1}}");

        // msgctxt becomes the first key segment.
        expect(flat[`menu${SEP}Save`]).toBe("Save");

        // Plural fans out into _one / _other suffixed keys, which the
        // pipeline already recognizes as plural slots.
        expect(flat[`${SEP}One item${SEP}_one`]).toBe("One item");
        expect(flat[`${SEP}One item${SEP}_other`]).toBe("{{arg1}} items");
    });

    it("normalizes positional placeholders and restores them on write", () => {
        const fixture = [
            "msgid \"\"",
            "msgstr \"\"",
            "\"Content-Type: text/plain; charset=UTF-8\\n\"",
            "\"Language: en\\n\"",
            "",
            "msgid \"%1$s sent %2$s\"",
            "msgstr \"\"",
            "",
        ].join("\n");

        const { flat, sidecar } = POAdapter.read(fixture);
        expect(flat[`${SEP}%1$s sent %2$s`]).toBe("{{arg1}} sent {{arg2}}");

        const output = POAdapter.write(flat, sidecar, "en", "en");
        const reparsed = po.parse(output);
        expect(
            reparsed.translations[""]["%1$s sent %2$s"].msgstr[0],
        ).toBe("%1$s sent %2$s");
    });

    it("round-trips through write: fills msgstr, restores placeholders, preserves comments", () => {
        const { flat, sidecar } = POAdapter.read(PO_FIXTURE);

        // Identity "translation" — exercises the restore + fan-in paths
        // without a live model.
        const output = POAdapter.write(flat, sidecar, "en", "fr");
        const reparsed = po.parse(output);

        // Header retargeted to the output language.
        expect(reparsed.headers["Language"]).toBe("fr");
        expect(reparsed.headers["Plural-Forms"]).toBe(
            "nplurals=2; plural=(n > 1);",
        );

        // Placeholders restored to their native printf tokens.
        expect(reparsed.translations[""]["Hello %s"].msgstr[0]).toBe(
            "Hello %s",
        );

        expect(reparsed.translations["menu"]["Save"].msgstr[0]).toBe("Save");

        // fr has two plural forms (one / other).
        expect(reparsed.translations[""]["One item"].msgstr).toEqual([
            "One item",
            "%d items",
        ]);

        // Non-translatable metadata survives the round-trip.
        const comments = reparsed.translations[""]["Hello %s"].comments;
        expect(comments?.translator).toBe("translator comment");
        expect(comments?.extracted).toBe("extracted comment");
        expect(comments?.reference).toBe("src/app.js:42");
        expect(comments?.flag).toBe("javascript-format");
    });

    it("fans plural slots into a 3-form target language", () => {
        const { flat, sidecar } = POAdapter.read(PO_FIXTURE);

        const output = POAdapter.write(flat, sidecar, "en", "pl");
        const reparsed = po.parse(output);

        expect(reparsed.headers["Plural-Forms"]).toBe(
            "nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);",
        );

        // _one fills the "one" slot; _other is cloned into the two
        // remaining (few / many) slots — the honest v1 behavior given
        // i18next only marks two plural forms.
        expect(reparsed.translations[""]["One item"].msgstr).toEqual([
            "One item",
            "%d items",
            "%d items",
        ]);
    });

    it("leaves a %% literal untouched on read and write", () => {
        const fixture = [
            "msgid \"\"",
            "msgstr \"\"",
            "\"Content-Type: text/plain; charset=UTF-8\\n\"",
            "\"Language: en\\n\"",
            "",
            // `%%` is an escaped literal percent, not an arg slot; the
            // adjacent `%s` is the only real placeholder (→ {{arg1}}).
            "msgid \"100%% done with %s\"",
            "msgstr \"\"",
            "",
        ].join("\n");

        const { flat, sidecar } = POAdapter.read(fixture);
        expect(flat[`${SEP}100%% done with %s`]).toBe(
            "100%% done with {{arg1}}",
        );

        const output = POAdapter.write(flat, sidecar, "en", "en");
        const reparsed = po.parse(output);
        expect(
            reparsed.translations[""]["100%% done with %s"].msgstr[0],
        ).toBe("100%% done with %s");
    });

    it("preserves width / precision specifiers across the round-trip", () => {
        const fixture = [
            "msgid \"\"",
            "msgstr \"\"",
            "\"Content-Type: text/plain; charset=UTF-8\\n\"",
            "\"Language: en\\n\"",
            "",
            "msgid \"%.2f kg at %3d items\"",
            "msgstr \"\"",
            "",
        ].join("\n");

        const { flat, sidecar } = POAdapter.read(fixture);
        expect(flat[`${SEP}%.2f kg at %3d items`]).toBe(
            "{{arg1}} kg at {{arg2}} items",
        );

        const output = POAdapter.write(flat, sidecar, "en", "en");
        const reparsed = po.parse(output);
        expect(
            reparsed.translations[""]["%.2f kg at %3d items"].msgstr[0],
        ).toBe("%.2f kg at %3d items");
    });

    it("leaves a model-invented arg reference literal instead of dropping it", () => {
        const fixture = [
            "msgid \"\"",
            "msgstr \"\"",
            "\"Content-Type: text/plain; charset=UTF-8\\n\"",
            "\"Language: en\\n\"",
            "",
            "msgid \"Hi %s\"",
            "msgstr \"\"",
            "",
        ].join("\n");

        const { sidecar } = POAdapter.read(fixture);
        const key = `${SEP}Hi %s`;

        // The model hallucinated a second placeholder the source never
        // had; arg1 restores to %s, arg2 has no token so it stays as the
        // literal {{arg2}} rather than silently vanishing.
        const output = POAdapter.write(
            { [key]: "{{arg1}} plus {{arg2}}" },
            sidecar,
            "en",
            "en",
        );

        const reparsed = po.parse(output);
        expect(reparsed.translations[""]["Hi %s"].msgstr[0]).toBe(
            "%s plus {{arg2}}",
        );
    });

    it("writes empty msgstr slots when the translation map omits keys", () => {
        // The model dropped every key from its response — write must
        // degrade to empty msgstrs (both singular and plural slots)
        // rather than throwing on the missing lookups.
        const { sidecar } = POAdapter.read(PO_FIXTURE);
        const reparsed = po.parse(POAdapter.write({}, sidecar, "en", "fr"));

        expect(reparsed.translations[""]["Hello %s"].msgstr[0]).toBe("");
        expect(reparsed.translations["menu"]["Save"].msgstr[0]).toBe("");
        expect(reparsed.translations[""]["One item"].msgstr).toEqual(["", ""]);
    });

    it("preserves untouched entry metadata byte-for-byte through compile", () => {
        const original = po.parse(PO_FIXTURE);
        const { flat, sidecar } = POAdapter.read(PO_FIXTURE);

        // Identity write — nothing material changes, so every source
        // entry's structural metadata must survive po.compile intact.
        const reparsed = po.parse(POAdapter.write(flat, sidecar, "en", "en"));

        for (const ctx of Object.keys(original.translations)) {
            for (const msgid of Object.keys(original.translations[ctx])) {
                if (ctx === "" && msgid === "") continue;
                const before = original.translations[ctx][msgid];
                const after = reparsed.translations[ctx][msgid];
                expect(after.msgid).toBe(before.msgid);
                expect(after.msgctxt).toBe(before.msgctxt);
                expect(after.msgid_plural).toBe(before.msgid_plural);
                expect(after.comments).toEqual(before.comments);
            }
        }
    });
});

describe("POAdapter.readTranslated", () => {
    it("exposes singular msgstr values keyed exactly as read()", () => {
        const target = [
            "msgid \"\"",
            "msgstr \"\"",
            "\"Content-Type: text/plain; charset=UTF-8\\n\"",
            "\"Language: fr\\n\"",
            "",
            "msgctxt \"menu\"",
            "msgid \"Save\"",
            "msgstr \"Enregistrer\"",
            "",
        ].join("\n");

        const { flat } = POAdapter.readTranslated!(target);
        // Same key shape as read(): msgctxt folds into the first segment.
        expect(flat[`menu${SEP}Save`]).toBe("Enregistrer");
    });

    it("maps a 2-form target's msgstr[] back onto _one / _other", () => {
        const target = [
            "msgid \"\"",
            "msgstr \"\"",
            "\"Content-Type: text/plain; charset=UTF-8\\n\"",
            "\"Plural-Forms: nplurals=2; plural=(n > 1);\\n\"",
            "\"Language: fr\\n\"",
            "",
            "msgid \"One item\"",
            "msgid_plural \"%d items\"",
            "msgstr[0] \"Un élément\"",
            "msgstr[1] \"%d éléments\"",
            "",
        ].join("\n");

        const { flat } = POAdapter.readTranslated!(target);
        // Values are kept verbatim — placeholders are NOT normalized on
        // the translated-read path (write's restore is then a no-op).
        expect(flat[`${SEP}One item${SEP}_one`]).toBe("Un élément");
        expect(flat[`${SEP}One item${SEP}_other`]).toBe("%d éléments");
    });

    it("collapses a 3-form target onto _one / _other via the source header", () => {
        const target = [
            "msgid \"\"",
            "msgstr \"\"",
            "\"Content-Type: text/plain; charset=UTF-8\\n\"",
            "\"Plural-Forms: nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);\\n\"",
            "\"Language: pl\\n\"",
            "",
            "msgid \"One item\"",
            "msgid_plural \"%d items\"",
            "msgstr[0] \"jeden element\"",
            "msgstr[1] \"%d elementy\"",
            "msgstr[2] \"%d elementów\"",
            "",
        ].join("\n");

        const { flat } = POAdapter.readTranslated!(target);
        // pl categories are [one, few, many]: index 0 → _one, and the
        // first non-"one" slot (few, index 1) → _other.
        expect(flat[`${SEP}One item${SEP}_one`]).toBe("jeden element");
        expect(flat[`${SEP}One item${SEP}_other`]).toBe("%d elementy");
    });

    it("yields empty strings for a target plural with missing msgstr slots", () => {
        const target = [
            "msgid \"\"",
            "msgstr \"\"",
            "\"Content-Type: text/plain; charset=UTF-8\\n\"",
            "\"Language: fr\\n\"",
            "",
            // A half-finished target: msgstr[1] was never filled in.
            "msgid \"One item\"",
            "msgid_plural \"%d items\"",
            "msgstr[0] \"Un élément\"",
            "msgstr[1] \"\"",
            "",
        ].join("\n");

        const { flat } = POAdapter.readTranslated!(target);
        expect(flat[`${SEP}One item${SEP}_one`]).toBe("Un élément");
        expect(flat[`${SEP}One item${SEP}_other`]).toBe("");
    });

    it("falls back to 2-form indices when the Language header is missing", () => {
        const target = [
            "msgid \"\"",
            "msgstr \"\"",
            "\"Content-Type: text/plain; charset=UTF-8\\n\"",
            "",
            "msgid \"One item\"",
            "msgid_plural \"%d items\"",
            "msgstr[0] \"first\"",
            "msgstr[1] \"second\"",
            "",
        ].join("\n");

        const { flat } = POAdapter.readTranslated!(target);
        expect(flat[`${SEP}One item${SEP}_one`]).toBe("first");
        expect(flat[`${SEP}One item${SEP}_other`]).toBe("second");
    });
});

describe("PropertiesAdapter", () => {
    it("reads keys, comments, and blank lines into a flat map", () => {
        const input = [
            "# a comment",
            "! also a comment",
            "",
            "greeting=Hello",
            "menu.save=Save",
        ].join("\n");

        const { flat } = PropertiesAdapter.read(input);
        expect(flat).toEqual({ "greeting": "Hello", "menu.save": "Save" });
    });

    it("round-trips a fixture byte-for-byte when nothing changes", () => {
        const input = [
            "# Localized strings",
            "",
            "greeting = Hello, {0}!",
            "menu.save:Save",
            "spaced   value with spaces",
            "",
        ].join("\n");

        const { flat, sidecar } = PropertiesAdapter.read(input);
        const output = PropertiesAdapter.write(flat, sidecar, "en", "en");
        expect(output).toBe(input);
    });

    it("accepts =, :, and whitespace separators", () => {
        const { flat } = PropertiesAdapter.read(
            ["a=one", "b:two", "c three"].join("\n"),
        );

        expect(flat).toEqual({ a: "one", b: "two", c: "three" });
    });

    it("normalizes MessageFormat placeholders to {{argN}}", () => {
        const { flat } = PropertiesAdapter.read(
            "welcome=Hi {0}, you have {1} messages",
        );

        expect(flat.welcome).toBe("Hi {{arg0}}, you have {{arg1}} messages");
    });

    it("preserves typed MessageFormat tokens through a translation", () => {
        const input = "count=You have {0,number,integer} items";
        const { flat, sidecar } = PropertiesAdapter.read(input);
        expect(flat.count).toBe("You have {{arg0}} items");

        const output = PropertiesAdapter.write(
            { count: "Vous avez {{arg0}} articles" },
            sidecar,
            "en",
            "fr",
        );

        expect(output).toBe("count=Vous avez {0,number,integer} articles");
    });

    it("leaves a model-invented placeholder literal on write", () => {
        const { sidecar } = PropertiesAdapter.read("k=Value {0}");
        const output = PropertiesAdapter.write(
            { k: "{{arg0}} et {{arg5}}" },
            sidecar,
            "en",
            "fr",
        );

        expect(output).toBe("k={0} et {{arg5}}");
    });

    it("decodes and re-encodes escapes for changed values", () => {
        const input = "path=C\\:\\\\temp";
        const { flat, sidecar } = PropertiesAdapter.read(input);
        expect(flat.path).toBe("C:\\temp");

        // Unchanged: original bytes are preserved verbatim.
        expect(PropertiesAdapter.write(flat, sidecar, "en", "en")).toBe(input);

        // Changed: a literal newline and backslash are re-escaped.
        const output = PropertiesAdapter.write(
            { path: "D:\\data\nnext" },
            sidecar,
            "en",
            "fr",
        );

        expect(output).toBe("path=D:\\\\data\\nnext");
    });

    it("decodes \\uXXXX escapes into their characters", () => {
        const { flat } = PropertiesAdapter.read("cafe=caf\\u00e9");
        expect(flat.cafe).toBe("café");
    });

    it("round-trips \\t \\n \\r \\f whitespace escapes both ways", () => {
        const { flat } = PropertiesAdapter.read("k=a\\tb\\nc\\rd\\fe");
        expect(flat.k).toBe("a\tb\nc\rd\fe");

        const { sidecar } = PropertiesAdapter.read("k=v");
        const output = PropertiesAdapter.write(
            { k: "a\tb\nc\rd\fe" },
            sidecar,
            "en",
            "fr",
        );

        expect(output).toBe("k=a\\tb\\nc\\rd\\fe");
    });

    it("keeps an escaped separator as part of the key", () => {
        const { flat, sidecar } = PropertiesAdapter.read("a\\:b=value");
        expect(flat["a:b"]).toBe("value");
        expect(PropertiesAdapter.write(flat, sidecar, "en", "en")).toBe(
            "a\\:b=value",
        );
    });

    it("joins line-continuation values into one entry", () => {
        const input = ["msg=line one \\", "    and line two"].join("\n");
        const { flat, sidecar } = PropertiesAdapter.read(input);
        expect(flat.msg).toBe("line one and line two");
        // Unchanged values keep the original multi-line layout.
        expect(PropertiesAdapter.write(flat, sidecar, "en", "en")).toBe(input);
    });

    it("escapes a leading space when a value changes", () => {
        const { sidecar } = PropertiesAdapter.read("k=v");
        const output = PropertiesAdapter.write(
            { k: " leading" },
            sidecar,
            "en",
            "fr",
        );

        expect(output).toBe("k=\\ leading");
    });

    it("re-emits the original bytes for keys missing from the translation", () => {
        const input = ["a=one", "b=two"].join("\n");
        const { sidecar } = PropertiesAdapter.read(input);
        // Only `a` is translated; `b` must survive untouched.
        const output = PropertiesAdapter.write({ a: "un" }, sidecar, "en", "fr");
        expect(output).toBe(["a=un", "b=two"].join("\n"));
    });

    it("preserves a file with no trailing newline", () => {
        const input = "a=one\nb=two";
        const { flat, sidecar } = PropertiesAdapter.read(input);
        expect(PropertiesAdapter.write(flat, sidecar, "en", "en")).toBe(input);
    });
});

describe("StringsAdapter", () => {
    it("reads quoted key/value pairs and ignores comments", () => {
        const input =
            "/* Greeting */\n" +
            "\"greeting\" = \"Hello\";\n" +
            "\"menu.save\" = \"Save\";\n";

        const { flat } = StringsAdapter.read(input);
        expect(flat).toEqual({ "greeting": "Hello", "menu.save": "Save" });
    });

    it("round-trips a fixture with comments and blanks byte-for-byte", () => {
        const input = `/* File header
   multi-line */

// inline note
"greeting" = "Hello, %@!";
"count" = "%d items";
`;

        const { flat, sidecar } = StringsAdapter.read(input);
        const output = StringsAdapter.write(flat, sidecar, "en", "en");
        expect(output).toBe(input);
    });

    it("normalizes %@ and %d placeholders to {{argN}}", () => {
        const { flat } = StringsAdapter.read(
            "\"k\" = \"Hi %@, you have %d new\";",
        );

        expect(flat.k).toBe("Hi {{arg1}}, you have {{arg2}} new");
    });

    it("restores positional placeholders on a changed value", () => {
        const input = "\"k\" = \"%1$@ sent %2$@\";";
        const { flat, sidecar } = StringsAdapter.read(input);
        expect(flat.k).toBe("{{arg1}} sent {{arg2}}");

        const output = StringsAdapter.write(
            { k: "{{arg2}} reçu de {{arg1}}" },
            sidecar,
            "en",
            "fr",
        );

        expect(output).toBe("\"k\" = \"%2$@ reçu de %1$@\";");
    });

    it("leaves a %% literal intact while normalizing a real %@", () => {
        const { flat } = StringsAdapter.read("\"k\" = \"100%% sure %@\";");
        expect(flat.k).toBe("100%% sure {{arg1}}");
    });

    it("decodes escapes and round-trips them byte-for-byte", () => {
        const input = "\"k\" = \"Line1\\nQuote: \\\"hi\\\" \\\\ end\";";
        const { flat, sidecar } = StringsAdapter.read(input);
        expect(flat.k).toBe("Line1\nQuote: \"hi\" \\ end");
        expect(StringsAdapter.write(flat, sidecar, "en", "en")).toBe(input);
    });

    it("decodes \\Uxxxx escapes into their characters", () => {
        const { flat } = StringsAdapter.read("\"k\" = \"caf\\U00e9\";");
        expect(flat.k).toBe("café");
    });

    it("round-trips \\t and \\r escapes both ways", () => {
        const { flat } = StringsAdapter.read("\"k\" = \"a\\tb\\rc\";");
        expect(flat.k).toBe("a\tb\rc");

        const { sidecar } = StringsAdapter.read("\"k\" = \"v\";");
        const output = StringsAdapter.write(
            { k: "a\tb\rc\\d" },
            sidecar,
            "en",
            "fr",
        );

        expect(output).toBe("\"k\" = \"a\\tb\\rc\\\\d\";");
    });

    it("re-escapes quotes, newlines, and backslashes for changed values", () => {
        const { sidecar } = StringsAdapter.read("\"k\" = \"v\";");
        const output = StringsAdapter.write(
            { k: "say \"hi\"\nbye" },
            sidecar,
            "en",
            "fr",
        );

        expect(output).toBe("\"k\" = \"say \\\"hi\\\"\\nbye\";");
    });

    it("keeps = and ; that appear inside a value", () => {
        const input = "\"k\" = \"a=b; c\";";
        const { flat, sidecar } = StringsAdapter.read(input);
        expect(flat.k).toBe("a=b; c");
        expect(StringsAdapter.write(flat, sidecar, "en", "en")).toBe(input);
    });

    it("re-emits the original value for keys missing from the translation", () => {
        const input = "\"a\" = \"one\";\n\"b\" = \"two\";";
        const { sidecar } = StringsAdapter.read(input);
        const output = StringsAdapter.write({ a: "un" }, sidecar, "en", "fr");
        expect(output).toBe("\"a\" = \"un\";\n\"b\" = \"two\";");
    });

    it("leaves a model-invented placeholder literal on write", () => {
        const { sidecar } = StringsAdapter.read("\"k\" = \"Value %@\";");
        const output = StringsAdapter.write(
            { k: "{{arg1}} et {{arg9}}" },
            sidecar,
            "en",
            "fr",
        );

        expect(output).toBe("\"k\" = \"%@ et {{arg9}}\";");
    });

    it("preserves a block comment and a file with no trailing newline", () => {
        const input = "/* c */\n\"k\" = \"v\";";
        const { flat, sidecar } = StringsAdapter.read(input);
        expect(StringsAdapter.write(flat, sidecar, "en", "en")).toBe(input);
    });
});

const YAML_FIXTURE = [
    "# Rails locale file",
    "en:",
    "  greeting: Hello",
    "  inbox:",
    "    # how many unread",
    "    unread: \"You have %{count} messages\"",
    "    price: '%<amount>.2f owing'",
    "  day_names:",
    "    - Monday",
    "    - Tuesday",
    "  retries: 3",
    "",
].join("\n");

describe("YAMLAdapter", () => {
    it("strips the locale root so source and target keys line up", () => {
        const { flat } = YAMLAdapter.read(YAML_FIXTURE);

        expect(flat).toEqual({
            "day_names*0": "Monday",
            "day_names*1": "Tuesday",
            greeting: "Hello",
            "inbox*price": "{{amount}} owing",
            "inbox*unread": "You have {{count}} messages",
        });

        // The same catalogue under a different locale root reads
        // identically — this is what makes diff mode line up.
        const french = YAML_FIXTURE.replace("en:", "fr:");
        expect(Object.keys(YAMLAdapter.read(french).flat).sort()).toEqual(
            Object.keys(flat).sort(),
        );
    });

    it("round-trips unchanged content, comments included", () => {
        const { flat, sidecar } = YAMLAdapter.read(YAML_FIXTURE);
        expect(YAMLAdapter.write(flat, sidecar, "en", "en")).toBe(YAML_FIXTURE);
    });

    it("retargets the locale root to the output language", () => {
        const { flat, sidecar } = YAMLAdapter.read(YAML_FIXTURE);
        const output = YAMLAdapter.write(
            { ...flat, greeting: "Bonjour" },
            sidecar,
            "en",
            "fr",
        );

        expect(output).toContain("fr:");
        expect(output).not.toContain("en:");
        expect(output).toContain("greeting: Bonjour");
        expect(output).toContain("# Rails locale file");
        expect(output).toContain("# how many unread");
        // Untranslated scalars keep their original type and value.
        expect(output).toContain("retries: 3");
    });

    it("restores Rails interpolation in both syntaxes", () => {
        const { flat, sidecar } = YAMLAdapter.read(YAML_FIXTURE);
        const output = YAMLAdapter.write(
            {
                ...flat,
                "inbox*price": "{{amount}} dû",
                "inbox*unread": "Vous avez {{count}} messages",
            },
            sidecar,
            "en",
            "fr",
        );

        expect(output).toContain("%{count} messages");
        expect(output).toContain("%<amount>.2f dû");
    });

    it("leaves a model-invented placeholder literal on write", () => {
        const { flat, sidecar } = YAMLAdapter.read(YAML_FIXTURE);
        const output = YAMLAdapter.write(
            { ...flat, "inbox*unread": "{{count}} et {{bogus}}" },
            sidecar,
            "en",
            "fr",
        );

        expect(output).toContain("%{count} et {{bogus}}");
    });

    it("re-quotes a value whose original plain style can no longer hold it", () => {
        const { flat, sidecar } = YAMLAdapter.read(YAML_FIXTURE);
        const output = YAMLAdapter.write(
            { ...flat, greeting: "Bonjour: le monde" },
            sidecar,
            "en",
            "fr",
        );

        // Emitted plainly this would parse as a nested mapping.
        expect(YAMLAdapter.read(output).flat.greeting).toBe(
            "Bonjour: le monde",
        );
    });

    it("does not mutate the sidecar between target languages", () => {
        const { flat, sidecar } = YAMLAdapter.read(YAML_FIXTURE);
        YAMLAdapter.write(
            { ...flat, greeting: "Bonjour" },
            sidecar,
            "en",
            "fr",
        );
        const second = YAMLAdapter.write(
            { ...flat, greeting: "Hallo" },
            sidecar,
            "en",
            "de",
        );

        expect(second).toContain("de:");
        expect(second).toContain("greeting: Hallo");
        expect(second).not.toContain("Bonjour");
    });

    it("treats a file with no locale root as a plain catalogue", () => {
        const input = "greeting: Hello\nfarewell: Bye\n";
        const { flat, sidecar } = YAMLAdapter.read(input);

        expect(flat).toEqual({ farewell: "Bye", greeting: "Hello" });
        expect(YAMLAdapter.write(flat, sidecar, "en", "fr")).toBe(input);
    });

    it("recognises a BCP-47 locale root", () => {
        const { flat, sidecar } = YAMLAdapter.read("pt-BR:\n  greeting: Oi\n");
        expect(flat).toEqual({ greeting: "Oi" });
        expect(YAMLAdapter.write(flat, sidecar, "pt", "fr")).toBe(
            "fr:\n  greeting: Oi\n",
        );
    });

    it("does not treat a non-locale single root as a wrapper", () => {
        const { flat } = YAMLAdapter.read("messages:\n  greeting: Hello\n");
        expect(flat).toEqual({ "messages*greeting": "Hello" });
    });

    it("adds a key the source catalogue did not contain", () => {
        const { flat, sidecar } = YAMLAdapter.read("en:\n  greeting: Hello\n");
        const output = YAMLAdapter.write(
            { ...flat, "inbox*unread": "Nouveau" },
            sidecar,
            "en",
            "fr",
        );

        expect(YAMLAdapter.read(output).flat).toEqual({
            greeting: "Hello",
            "inbox*unread": "Nouveau",
        });
    });

    it("assumes Rails %{} form for a key the source never had", () => {
        const { flat, sidecar } = YAMLAdapter.read("en:\n  greeting: Hello\n");
        const output = YAMLAdapter.write(
            { ...flat, legacy: "{{count}} restants" },
            sidecar,
            "en",
            "fr",
        );

        expect(output).toContain("%{count} restants");
    });

    it("throws on malformed YAML", () => {
        expect(() => YAMLAdapter.read("en:\n  a: [1, 2\n")).toThrow();
    });
});

const TS_FIXTURE = [
    "import type { Translations } from \"./types\";",
    "",
    "// Locale catalogue",
    "export const enTranslations = {",
    "    TimeSignatureModal: {",
    "        header: \"Time Signature\",",
    "        hint: 'Pick a value',",
    "    },",
    "    counts: [\"one\", \"two\"],",
    "    total: 3,",
    "    dynamic: `${1} items`,",
    "} satisfies Translations;",
    "",
].join("\n");

describe("module adapter (.ts / .js)", () => {
    it("extracts strings from an exported const, skipping non-literals", () => {
        const { flat } = TypeScriptAdapter.read(TS_FIXTURE);

        expect(flat).toEqual({
            "TimeSignatureModal*header": "Time Signature",
            "TimeSignatureModal*hint": "Pick a value",
            "counts*0": "one",
            "counts*1": "two",
        });
    });

    it("round-trips unchanged content byte-for-byte", () => {
        const { flat, sidecar } = TypeScriptAdapter.read(TS_FIXTURE);
        expect(TypeScriptAdapter.write(flat, sidecar, "en", "en")).toBe(
            TS_FIXTURE,
        );
    });

    it("preserves imports, comments, types, and quote style", () => {
        const { flat, sidecar } = TypeScriptAdapter.read(TS_FIXTURE);
        const output = TypeScriptAdapter.write(
            {
                ...flat,
                "TimeSignatureModal*header": "Signature rythmique",
                "TimeSignatureModal*hint": "Choisissez une valeur",
            },
            sidecar,
            "en",
            "fr",
        );

        expect(output).toContain("import type { Translations }");
        expect(output).toContain("// Locale catalogue");
        expect(output).toContain("satisfies Translations");
        expect(output).toContain("header: \"Signature rythmique\"");
        // The single-quoted entry stays single-quoted.
        expect(output).toContain("hint: 'Choisissez une valeur'");
        // Untouched non-literals survive verbatim.
        expect(output).toContain("total: 3");
        expect(output).toContain("dynamic: `${1} items`");
    });

    it("escapes quotes and newlines in the original quote style", () => {
        const { flat, sidecar } = TypeScriptAdapter.read(TS_FIXTURE);
        const output = TypeScriptAdapter.write(
            {
                ...flat,
                "TimeSignatureModal*header": "L\"un\"\nsuite\\fin",
                "TimeSignatureModal*hint": "L'un",
            },
            sidecar,
            "en",
            "fr",
        );

        expect(output).toContain("header: \"L\\\"un\\\"\\nsuite\\\\fin\"");
        expect(output).toContain("hint: 'L\\'un'");
        // The re-parsed file yields exactly what we put in.
        const { flat: reread } = TypeScriptAdapter.read(output);
        expect(reread["TimeSignatureModal*header"]).toBe("L\"un\"\nsuite\\fin");
        expect(reread["TimeSignatureModal*hint"]).toBe("L'un");
    });

    it("finds a CommonJS module.exports catalogue", () => {
        const input = "module.exports = { greeting: \"Hello\" };\n";
        const { flat, sidecar } = JavaScriptAdapter.read(input);

        expect(flat).toEqual({ greeting: "Hello" });
        expect(
            JavaScriptAdapter.write(
                { greeting: "Bonjour" },
                sidecar,
                "en",
                "fr",
            ),
        ).toBe("module.exports = { greeting: \"Bonjour\" };\n");
    });

    it("prefers a default export over other object literals", () => {
        const input = [
            "const helper = { ignored: \"nope\" };",
            "export default { greeting: \"Hello\" };",
            "",
        ].join("\n");

        expect(TypeScriptAdapter.read(input).flat).toEqual({
            greeting: "Hello",
        });
    });

    it("handles `export default {...} as const`", () => {
        const input = "export default { greeting: \"Hello\" } as const;\n";
        expect(TypeScriptAdapter.read(input).flat).toEqual({
            greeting: "Hello",
        });
    });

    it("reads quoted and dotted keys", () => {
        const input = "export default { \"foo.bar\": \"x\", 'a b': \"y\" };\n";
        expect(TypeScriptAdapter.read(input).flat).toEqual({
            "a b": "y",
            "foo.bar": "x",
        });
    });

    it("falls back to a lone bare const", () => {
        const input = "const translations = { greeting: \"Hello\" };\n";
        expect(TypeScriptAdapter.read(input).flat).toEqual({
            greeting: "Hello",
        });
    });

    it("skips computed keys and spreads it cannot address", () => {
        const input = [
            "const base = { a: \"A\" };",
            "export default { ...base, [key]: \"skipped\", kept: \"Kept\" };",
            "",
        ].join("\n");

        expect(TypeScriptAdapter.read(input).flat).toEqual({ kept: "Kept" });
    });

    it("re-emits a template-literal value as a template literal", () => {
        const input = "export default { greeting: `Hello` };\n";
        const { sidecar } = TypeScriptAdapter.read(input);
        expect(
            TypeScriptAdapter.write(
                { greeting: "Bonjour `le` ${monde}" },
                sidecar,
                "en",
                "fr",
            ),
        ).toBe("export default { greeting: `Bonjour \\`le\\` \\${monde}` };\n");
    });

    it("throws when no catalogue object can be found", () => {
        expect(() =>
            TypeScriptAdapter.read("export function f() {}\n"),
        ).toThrow(/No translation object found/);
    });
});
