import {
    getAdapterByExtension,
    getAdapterByName,
    getAdapterForFile,
    listFormatNames,
} from "../formats/registry";
import { po } from "gettext-parser";
import JSONAdapter from "../formats/json_adapter";
import POAdapter from "../formats/po_adapter";

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

    it("lists registered format names", () => {
        expect(listFormatNames()).toEqual(["json", "po"]);
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
