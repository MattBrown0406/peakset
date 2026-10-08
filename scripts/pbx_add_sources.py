#!/usr/bin/env python3
"""Add Swift source files to the PeakSet app target in project.pbxproj.

Usage: scripts/pbx_add_sources.py FileA.swift [FileB.swift ...]
Files must live in ios/PeakSet/. Idempotent: existing entries are skipped.
"""
import re
import sys
from pathlib import Path

project = Path(__file__).resolve().parent.parent / "ios/PeakSet.xcodeproj/project.pbxproj"
text = project.read_text()
used = set(re.findall(r"\b1A2B3C4D5E6F7[0-9A-F]{11}\b", text))


def next_id(prefix):
    for n in range(1, 0xFFF):
        candidate = f"{prefix}{n:03X}"
        if candidate not in used:
            used.add(candidate)
            return candidate
    raise SystemExit("out of ids")


for name in sys.argv[1:]:
    if f"/* {name} */ = {{isa = PBXFileReference" in text:
        continue
    file_ref = next_id("1A2B3C4D5E6F700000001")
    build_file = next_id("1A2B3C4D5E6F700000000")
    text = text.replace(
        "/* End PBXBuildFile section */",
        f"\t\t{build_file} /* {name} in Sources */ = {{isa = PBXBuildFile; fileRef = {file_ref} /* {name} */; }};\n/* End PBXBuildFile section */",
    )
    text = text.replace(
        "/* End PBXFileReference section */",
        f"\t\t{file_ref} /* {name} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {name}; sourceTree = \"<group>\"; }};\n/* End PBXFileReference section */",
    )
    group_anchor = "\t\t\t\t1A2B3C4D5E6F700000000108 /* boxing-bell.wav */,\n"
    phase_anchor = "\t\t\t\t1A2B3C4D5E6F700000000005 /* PeakSetNativeServices.swift in Sources */,\n"
    # A silent miss here would leave the file outside every group and build
    # phase: Xcode shows nothing and the source never compiles.
    for anchor, label in ((group_anchor, "PeakSet group"), (phase_anchor, "PeakSet Sources phase")):
        if text.count(anchor) != 1:
            raise SystemExit(f"{label} anchor not found exactly once in project.pbxproj; update pbx_add_sources.py")
    text = text.replace(group_anchor, f"{group_anchor}\t\t\t\t{file_ref} /* {name} */,\n")
    text = text.replace(phase_anchor, f"{phase_anchor}\t\t\t\t{build_file} /* {name} in Sources */,\n")

project.write_text(text)
