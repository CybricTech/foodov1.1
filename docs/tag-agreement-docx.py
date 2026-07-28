#!/usr/bin/env python3
"""
Insert DocuSeal {{field;role=...}} tags into the blank Merchant Agreement DOCX.

DocuSeal derives every field's position from where its tag sits in the text, so
this is what lets us avoid hand-calibrating pixel coordinates against the PDF.

Matching is by CONTENT, never by node index: Word splits text across <w:t> runs
however it likes, and an unrelated edit (rewording "Prepared by", changing the
entity name, respacing a paragraph) silently renumbers every node. An earlier
index-based version of this script would have tagged the wrong blanks after
exactly such an edit. Everything below anchors on the visible label instead, and
the script hard-fails if an expected blank is missing or a placeholder survives.

Signature blanks are ambiguous alone ("Name:" appears four times), so the walker
tracks which party's block it is inside and whether it has reached that block's
witness sub-block.

Usage:
    python3 docs/tag-agreement-docx.py <blank.docx> <tagged-out.docx>
Then:
    docuseal templates create-docx --file <tagged-out.docx> \
        --name "Kitchyn Merchant Agreement"
"""
import html
import re
import sys
import zipfile

M = "role=Merchant"
K = "role=Kitchyn"
BLANK = r"_{3,}"  # a fill-in rule: three or more underscores

# The contracting entity as defined in the preamble. The signature block has
# lagged behind a rename before, which would have had the agreement executed on
# behalf of a party other than the one defined as "Kitchyn".
ENTITY = "KITCHYN TECHNOLOGIES LIMITED"

# Schedule 1: node anchor -> tag per blank inside that node, in order.
SCHEDULE = [
    ("RC/BN No.",                        [f"{{{{rc_number;{M};required=false}}}}"]),
    ("2. Commission on each Order:",     [f"{{{{commission_pct;{M}}}}}"]),
    ("3. Monthly Subscription Fee:",     [f"{{{{subscription_fee;{M}}}}}"]),
    ("4. Free Period:",                  [f"{{{{free_period_start;{M};required=false}}}}",
                                          f"{{{{free_period_end;{M};required=false}}}}"]),
    ("6. In-House Delivery commission:", [f"{{{{inhouse_commission_pct;{M};required=false}}}}"]),
    ("7. Other service or transaction",  [f"{{{{other_fees;{M};required=false}}}}"]),
    ("8. Settlement cycle:",             [f"{{{{settlement_cycle_days;{M}}}}}"]),
    ("9. Designated Merchant bank",      [f"{{{{bank_name;{M}}}}}",
                                          f"{{{{bank_account_name;{M}}}}}"]),
    ("Account Number:",                  [f"{{{{bank_account_number;{M}}}}}"]),
    ("10. Agreed Order preparation",     [f"{{{{prep_time_minutes;{M}}}}}"]),
]

# The two tick-box rows are replaced wholesale; the admin's stored selection is
# rendered using Schedule 1's own wording (see LEGAL_STATUS_LABELS /
# DELIVERY_MODE_LABELS in apps/web/lib/docuseal.ts).
CHECKBOX_ROWS = [
    ("1. Merchant legal status:", r"\[\s*\]\s*Incorporated company.*?Individual\.",
     f"{{{{legal_status;{M};required=false}}}}"),
    ("5. Delivery mode(s) enabled:", r"\[\s*\]\s*Platform Delivery.*?Both\.",
     f"{{{{delivery_modes;{M}}}}}"),
]

# Signature blanks, resolved against the party whose block we are in.
#
# The witness sub-blocks are stripped entirely (see strip_witness_blocks). They
# sat on the SAME DocuSeal role as the party being witnessed, so the signer
# would have completed their own witness's name and signature — an attestation
# by the very person it attests, which weakens the document rather than
# strengthening it. Proper witnessing would need separate submitter roles with
# their own email addresses. This is a simple contract, not a deed, and clause
# 21.3 already provides for electronic execution.
SIG_LABELS = {
    ("kitchyn", "Name:"):         f"{{{{kitchyn_name;{K}}}}}",
    ("kitchyn", "Signature:"):    f"{{{{kitchyn_signature;{K};type=signature}}}}",
    ("kitchyn", "Designation:"):  f"{{{{kitchyn_designation;{K}}}}}",
    ("kitchyn", "Date:"):         f"{{{{kitchyn_date;{K};type=datenow}}}}",
    ("merchant", "Name:"):        f"{{{{merchant_signatory_name;{M}}}}}",
    ("merchant", "Signature:"):   f"{{{{merchant_signature;{M};type=signature}}}}",
    ("merchant", "Designation:"): f"{{{{merchant_designation;{M}}}}}",
    ("merchant", "Date:"):        f"{{{{merchant_date;{M};type=datenow}}}}",
}

# Every field the template must end up with. apps/web/lib/docuseal.ts prefills by
# name and a mismatch fails silently as a blank box for the signer, so the full
# set is asserted rather than trusted.
EXPECTED = (
    set(SIG_LABELS.values())
    | {t for _, tags in SCHEDULE for t in tags}
    | {r for _, _, r in CHECKBOX_ROWS}
    | {
        f"{{{{merchant_legal_name;{M}}}}}",
        f"{{{{merchant_address;{M};required=false}}}}",
        f"{{{{effective_date;{M};type=date;format=DD/MM/YYYY}}}}",
    }
)


def strip_witness_blocks(xml: str) -> str:
    """Drop each "In the presence of (Witness):" heading and the Name/Address/
    Signature/Date paragraphs that follow it, for both parties.

    Whole <w:p> paragraphs are removed, not just their text, so no empty ruled
    lines are left behind. Dropping stops at the first paragraph that isn't one
    of the witness labels, so the next party's block is never swallowed.
    """
    labels = ("Name:", "Address:", "Signature:", "Date:")
    out, dropping, removed = [], False, 0

    def tail(chunk: str) -> str:
        """Whatever trails the paragraph's own </w:p>.

        The final witness paragraph is the last element in the body, so its
        chunk also carries </w:body></w:document>. Dropping the chunk whole
        would strip those and yield a malformed docx that the API rejects
        with a bare 500.
        """
        i = chunk.rfind("</w:p>")
        return chunk[i + len("</w:p>"):] if i != -1 else ""

    for para in re.split(r"(?=<w:p[ >])", xml):
        text = html.unescape(re.sub(r"<[^>]+>", "", para)).strip()
        if "In the presence of" in text:
            dropping, removed = True, removed + 1
            out.append(tail(para))
            continue
        if dropping:
            if text == "" or any(text.startswith(l) for l in labels):
                removed += 1
                out.append(tail(para))
                continue
            dropping = False
        out.append(para)

    joined = "".join(out)
    try:
        __import__("xml.dom.minidom", fromlist=["parseString"]).parseString(joined)
    except Exception as exc:  # noqa: BLE001 - surface the real reason
        raise SystemExit(f"FATAL: witness removal produced malformed XML: {exc}")
    if "In the presence of" in joined:
        raise SystemExit("FATAL: witness heading survived removal")
    print(f"removed {removed} witness paragraphs")
    return joined


def tag(src: str, out: str) -> None:
    with zipfile.ZipFile(src) as z:
        names = z.namelist()
        blobs = {n: z.read(n) for n in names}
    xml = strip_witness_blocks(blobs["word/document.xml"].decode("utf-8"))

    state = {"party": None}
    applied: list[str] = []

    def rewrite(inner: str) -> str:
        plain = html.unescape(inner)
        new = plain

        if "FOR AND ON BEHALF OF" in plain:
            state["party"] = "merchant" if "[MERCHANT LEGAL NAME]" in plain else "kitchyn"
            if state["party"] == "kitchyn":
                new = re.sub(r"KITCHYN\S*(\s+\S+)*?\s+LIMITED", ENTITY, new)

        if "[MERCHANT LEGAL NAME]" in new:
            new = new.replace("[MERCHANT LEGAL NAME]", f"{{{{merchant_legal_name;{M}}}}}")
        if "[MERCHANT ADDRESS]" in new:
            new = new.replace("[MERCHANT ADDRESS]", f"{{{{merchant_address;{M};required=false}}}}")

        # "made this ___ day of ___ 20___" collapses into one date field.
        if "is made this" in new:
            new = re.sub(
                rf"this\s+{BLANK}\s+day of\s+{BLANK}\s+20{BLANK}",
                f"this {{{{effective_date;{M};type=date;format=DD/MM/YYYY}}}}",
                new,
            )

        for anchor, pattern, rep in CHECKBOX_ROWS:
            if anchor in new:
                new = re.sub(pattern, rep, new, flags=re.S)

        for anchor, tags in SCHEDULE:
            if anchor in new:
                it = iter(tags)
                new = re.sub(BLANK, lambda _m: next(it, "___MISSING___"), new)

        if state["party"] and re.search(BLANK, new):
            for label in ("Designation:", "Signature:", "Name:", "Date:"):
                if new.lstrip().startswith(label):
                    rep = SIG_LABELS.get((state["party"], label))
                    if rep:
                        new = re.sub(BLANK, rep, new, count=1)
                    break

        if new == plain:
            return inner
        applied.extend(re.findall(r"\{\{.*?\}\}", new))
        return new.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def repl(m: "re.Match[str]") -> str:
        open_tag, inner, close = m.group(1), m.group(2), m.group(3)
        new = rewrite(inner)
        if new == inner:
            return m.group(0)
        if "xml:space" not in open_tag:  # keep surrounding spacing intact
            open_tag = open_tag[:-1] + ' xml:space="preserve">'
        return open_tag + new + close

    new_xml = re.sub(r"(<w:t[^>]*>)(.*?)(</w:t>)", repl, xml, flags=re.S)

    # ---- fail loudly rather than upload a half-tagged contract --------------
    found = set(re.findall(r"\{\{.*?\}\}", new_xml))
    missing = EXPECTED - found
    if missing:
        raise SystemExit(f"FATAL: tags not placed: {sorted(missing)}")
    if "___MISSING___" in new_xml:
        raise SystemExit("FATAL: a node had more blanks than tags supplied")
    for leftover in ("[MERCHANT LEGAL NAME]", "[MERCHANT ADDRESS]", "KITCHYN.APP"):
        if leftover in new_xml:
            raise SystemExit(f"FATAL: leftover placeholder {leftover!r}")
    # merchant_legal_name is intentionally repeated (cover, preamble, signature).
    dupes = {t for t in found if applied.count(t) > 1 and "merchant_legal_name" not in t}
    if dupes:
        raise SystemExit(f"FATAL: field placed more than once: {sorted(dupes)}")
    if re.search(BLANK, re.sub(r"<[^>]+>", "", new_xml)):
        leftovers = [s[:90] for s in re.sub(r"<[^>]+>", "", new_xml).split("\n") if re.search(BLANK, s)]
        raise SystemExit(f"FATAL: untagged blanks remain: {leftovers}")

    blobs["word/document.xml"] = new_xml.encode("utf-8")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for n in names:
            z.writestr(n, blobs[n])

    print(f"placed {len(found)} unique fields ({len(applied)} tag instances)")
    for t in sorted(found):
        print("  ", t)
    print("wrote", out)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    tag(sys.argv[1], sys.argv[2])
