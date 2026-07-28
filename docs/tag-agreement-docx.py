import re, shutil, zipfile, os

SRC = "/Users/amir/Downloads/Repos/foodov1.1/docs/Kitchyn_Merchant_Agreement_TEMPLATE.docx"
OUT = "/private/tmp/claude-501/-Users-amir-Downloads-Repos-foodov1-1/89a9f3c6-107a-4d8b-a9d6-b32964d84b05/scratchpad/ds/Kitchyn_Merchant_Agreement_TAGGED.docx"

M = "role=Merchant"
K = "role=Kitchyn"

# node index -> full replacement for the <w:t> inner text
REPL = {
    5:  f"{{{{merchant_legal_name;{M}}}}}",
    13: f"{{{{effective_date;{M};type=date;format=DD/MM/YYYY}}}}",
    14: " ",
    15: "",
    16: " (the “Effective Date”)",
    20: f"{{{{merchant_legal_name;{M}}}}}",
    214: f"{{{{legal_status;{M};required=false}}}}",
    216: f"{{{{rc_number;{M};required=false}}}}",
    218: f"{{{{commission_pct;{M}}}}}",
    221: f"{{{{subscription_fee;{M}}}}}",
    224: f"{{{{free_period_start;{M};required=false}}}}",
    226: f"{{{{free_period_end;{M};required=false}}}}",
    230: f"{{{{delivery_modes;{M}}}}}",
    232: f"{{{{inhouse_commission_pct;{M};required=false}}}}",
    235: f"{{{{other_fees;{M};required=false}}}}",
    237: f"{{{{settlement_cycle_days;{M}}}}}",
    240: f"{{{{bank_name;{M}}}}}",
    242: f"{{{{bank_account_name;{M}}}}}",
    244: f"{{{{bank_account_number;{M}}}}}",
    246: f"{{{{prep_time_minutes;{M}}}}}",
    # Kitchyn signature block
    252: f"{{{{kitchyn_name;{K}}}}}",
    254: f"{{{{kitchyn_signature;{K};type=signature}}}}",
    256: f"{{{{kitchyn_designation;{K}}}}}",
    258: f"{{{{kitchyn_date;{K};type=datenow}}}}",
    261: f"{{{{kitchyn_witness_name;{K};required=false}}}}",
    263: f"{{{{kitchyn_witness_address;{K};required=false}}}}",
    265: f"{{{{kitchyn_witness_signature;{K};type=signature;required=false}}}}",
    267: f"{{{{kitchyn_witness_date;{K};type=date;required=false}}}}",
    # Merchant signature block
    268: f"FOR AND ON BEHALF OF {{{{merchant_legal_name;{M}}}}}",
    270: f"{{{{merchant_signatory_name;{M}}}}}",
    272: f"{{{{merchant_signature;{M};type=signature}}}}",
    274: f"{{{{merchant_designation;{M}}}}}",
    276: f"{{{{merchant_date;{M};type=datenow}}}}",
    279: f"{{{{merchant_witness_name;{M};required=false}}}}",
    281: f"{{{{merchant_witness_address;{M};required=false}}}}",
    283: f"{{{{merchant_witness_signature;{M};type=signature;required=false}}}}",
    285: f"{{{{merchant_witness_date;{M};type=date;required=false}}}}",
}
# substring replacement inside a node
SUBST = {21: ("[MERCHANT ADDRESS]", f"{{{{merchant_address;{M};required=false}}}}")}

with zipfile.ZipFile(SRC) as z:
    xml = z.read("word/document.xml").decode("utf-8")
    names = z.namelist()
    blobs = {n: z.read(n) for n in names}

out, last, idx, applied = [], 0, 0, 0
for m in re.finditer(r"(<w:t[^>]*>)(.*?)(</w:t>)", xml, re.S):
    inner = m.group(2)
    new = None
    if idx in REPL:
        new = REPL[idx]; applied += 1
    elif idx in SUBST:
        old, rep = SUBST[idx]
        if old in inner:
            new = inner.replace(old, rep); applied += 1
        else:
            raise SystemExit(f"FATAL: node {idx} missing {old!r}")
    if new is not None:
        tag = m.group(1)
        if 'xml:space' not in tag:                      # keep leading/trailing spaces intact
            tag = tag[:-1] + ' xml:space="preserve">'
        out.append(xml[last:m.start()]); out.append(tag + new + m.group(3))
        last = m.end()
    idx += 1
out.append(xml[last:])
new_xml = "".join(out)

assert applied == len(REPL) + len(SUBST), f"applied {applied} != {len(REPL)+len(SUBST)}"
for bad in ("[MERCHANT LEGAL NAME]", "[MERCHANT ADDRESS]"):
    assert bad not in new_xml, f"leftover placeholder: {bad}"

blobs["word/document.xml"] = new_xml.encode("utf-8")
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for n in names:
        z.writestr(n, blobs[n])

tags = sorted(set(re.findall(r"\{\{([^;}]+)[;}]", new_xml)))
print(f"replacements applied: {applied}")
print(f"unique field names ({len(tags)}):")
for t in tags: print("  -", t)
print("\nwrote:", OUT, os.path.getsize(OUT), "bytes")
