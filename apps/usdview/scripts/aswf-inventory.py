#!/usr/bin/env python3
"""Inventory all tracked USD-family files; lexical hints are not USD evaluation.

Usage: python3 scripts/aswf-inventory.py /path/to/pinned/usd-wg/assets
Never downloads linked external assets or changes the source checkout.
"""
import argparse
import collections
import hashlib
import io
import json
import pathlib
import posixpath
import re
import subprocess
import zipfile

EXTENSIONS = {'.usd', '.usda', '.usdc', '.usdz'}
REPOSITORY = 'https://github.com/usd-wg/assets'


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])


def format_of(data):
    if data.startswith(b'#usda'): return 'usda'
    if data.startswith(b'PXR-USDC'): return 'usdc'
    if data.startswith(b'PK\x03\x04'): return 'zip'
    if data.startswith(b'version https://git-lfs.github.com/spec/'): return 'git-lfs-pointer'
    return 'unrecognized'


def hints(data):
    if format_of(data) != 'usda':
        return {'inspection': 'binary-or-unrecognized; no text feature claims', 'authoredTypes': [], 'shaderIds': [], 'subdivisionSchemes': [], 'assetReferences': [], 'heuristicFeatures': []}
    text = data.decode('utf-8', errors='replace')
    types = sorted(set(re.findall(r'\b(?:def|class)\s+(\w+)\s+"', text)))
    ids = sorted(set(re.findall(r'\binfo:id\s*=\s*"([^"\n]*)"', text)))
    schemes = sorted(set(re.findall(r'\bsubdivisionScheme\s*=\s*"([^"\n]*)"', text)))
    refs = sorted(set(re.findall(r'@([^@\n]+)@', text)))
    patterns = {
        'references': r'\breferences\s*=', 'payloads': r'\bpayload\s*=', 'sublayers': r'\bsubLayers\s*=',
        'variants': r'\bvariantSet\b', 'timeSamples': r'\.timeSamples\s*=',
        'splines': r'\.spline\s*=', 'materialBindings': r'\bmaterial:binding',
        'MaterialX': r'outputs:mtlx:|ND_\w|\.mtlx\b', 'UsdPreviewSurface': r'UsdPreviewSurface',
        'textures': r'UsdUVTexture|\.png\b|\.exr\b|\.jpg\b|\.jpeg\b|\.tif\b',
        'displayColor': r'primvars:displayColor', 'normals': r'\bnormals\s*[=.(]',
        'visibility': r'\bvisibility\s*=', 'transforms': r'xformOp:',
        'creaseTags': r'\b(?:creaseIndices|creaseLengths|creaseSharpnesses|cornerIndices|cornerSharpnesses)\b',
        'holes': r'\bholeIndices\b', 'textureCoordinates': r'primvars:st\b',
        'faceVarying': r'"faceVarying"', 'instanceable': r'\binstanceable\s*=\s*(?:true|1)',
        'skinning': r'\bSkelRoot\b|\bSkeleton\b|skel:', 'collections': r'collection:',
        'colorManagement': r'colorSpace|ColorSpaceAPI', 'purpose': r'\bpurpose\s*=',
    }
    return {'inspection': 'lexical hints only; includes comments and unselected variants; no composition/defaults evaluated',
            'authoredTypes': types, 'shaderIds': ids, 'subdivisionSchemes': schemes,
            'assetReferences': refs, 'heuristicFeatures': sorted(k for k, p in patterns.items() if re.search(p, text))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('checkout', type=pathlib.Path)
    parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path('out/aswf/inventory.json'))
    args = parser.parse_args()
    root = args.checkout.resolve()
    commit = git(root, 'rev-parse', 'HEAD').decode().strip()
    if git(root, 'status', '--porcelain', '--untracked-files=no').strip():
        raise SystemExit('Source has tracked changes; inventory requires a clean pinned checkout.')
    tracked = sorted(p.decode() for p in git(root, 'ls-files', '-z').split(b'\0') if p)
    usd_paths = [p for p in tracked if pathlib.PurePosixPath(p).suffix.lower() in EXTENSIONS]
    docs = [p for p in tracked if pathlib.PurePosixPath(p).name.lower().startswith(('readme', 'license', 'copying', 'notice'))]
    tracked_set = set(tracked)
    doc_text = {p: (root / p).read_text(errors='replace') for p in docs}
    entries = []
    incoming = collections.defaultdict(set)
    for path in usd_paths:
        data = (root / path).read_bytes()
        folder = posixpath.dirname(path)
        parents = []
        current = folder
        while True:
            parents.append(current)
            if not current: break
            current = posixpath.dirname(current)
        nearby = [d for parent in parents for d in docs if posixpath.dirname(d) == parent]
        readmes = [d for d in nearby if pathlib.PurePosixPath(d).name.lower().startswith('readme')]
        licenses = [d for d in nearby if pathlib.PurePosixPath(d).name.lower().startswith(('license', 'copying', 'notice'))]
        entry = {'path': path, 'extension': pathlib.PurePosixPath(path).suffix.lower()[1:],
                 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'format': format_of(data),
                 'group': '/'.join(path.split('/')[:2]), 'source': f'{REPOSITORY}/blob/{commit}/{path}',
                 'readmeSources': readmes, 'licenseSources': licenses,
                 'intent': {'status': 'unreviewed', 'nameHints': [word for word in ['invalid', 'empty', 'inverse', 'negative', 'swapped', 'missing', 'problem', 'puzzle'] if word in path.lower()],
                            'note': 'Name hints do not establish malformed input or expected success/failure; inspect README and native results.'},
                 **hints(data)}
        resolved_refs = []
        for ref in entry['assetReferences']:
            if '://' in ref or ref.startswith('/'):
                target = None
            else:
                target = posixpath.normpath(posixpath.join(folder, ref.split('[')[0]))
            resolved_refs.append({'authored': ref, 'candidatePath': target, 'tracked': target in tracked_set if target else False})
            if target in usd_paths: incoming[target].add(path)
        entry['referenceCandidates'] = resolved_refs
        if format_of(data) == 'zip':
            try:
                with zipfile.ZipFile(io.BytesIO(data)) as archive:
                    members = []
                    for item in archive.infolist():
                        is_usd = pathlib.PurePosixPath(item.filename).suffix.lower() in EXTENSIONS
                        members.append({'path': item.filename, 'bytes': item.file_size, 'compressedBytes': item.compress_size,
                                        'usdFamily': is_usd, **({'format': format_of(archive.read(item)), **hints(archive.read(item))} if is_usd else {})})
                    entry['packageMembers'] = members
                    entry['packageFirstMember'] = members[0]['path'] if members else None
            except (zipfile.BadZipFile, RuntimeError, NotImplementedError) as error:
                entry['packageInventoryError'] = str(error)
        entries.append(entry)
    for entry in entries:
        users = sorted(incoming[entry['path']])
        entry['referencedByTextCandidates'] = users
        entry['roleHint'] = 'dependency-or-also-entrypoint' if users else 'entrypoint-candidate-or-unseen-binary-dependency'
        entry['roleEvidence'] = 'Lexical incoming asset references only; binary/package references, expressions and external consumers may be missing. All files remain test targets.'
    document_entries = []
    for path, text in doc_text.items():
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        document_entries.append({'path': path, 'source': f'{REPOSITORY}/blob/{commit}/{path}',
                                 'introExcerpt': '\n'.join(lines[:12])[:2000],
                                 'intentOrLicenseLines': [line[:500] for line in lines if re.search(r'invalid|malformed|expected|incorrect|license|copyright|public domain|CC[- ]|creative commons', line, re.I)][:30]})
    result = {
        'schemaVersion': 1, 'repository': REPOSITORY, 'commit': commit,
        'scope': 'Every Git-tracked .usd/.usda/.usdc/.usdz file in this repository, including docs, intent-vfx, full_assets, dependencies and malformed candidates. No external linked downloads.',
        'method': 'Git tracked-file enumeration and exact byte hashes; magic detection; ZIP directory enumeration; lexical USDA hints. No native USD parsing or rendering performed by this inventory.',
        'limitations': ['Role hints are not an authoritative root/dependency split.', 'Authored feature hints omit defaults, composition, binary layer content and resolved variants.', 'README excerpts are context, not adjudicated expected behavior or license advice.', 'Package member USD files are additionally enumerated within each package; tracked packages count once in totalUsdFiles.'],
        'summary': {'trackedFiles': len(tracked), 'totalUsdFiles': len(entries), 'usdBytes': sum(x['bytes'] for x in entries),
                    'byExtension': dict(sorted(collections.Counter(x['extension'] for x in entries).items())),
                    'byFormat': dict(sorted(collections.Counter(x['format'] for x in entries).items())),
                    'byTopDirectory': dict(sorted(collections.Counter(x['path'].split('/')[0] for x in entries).items())),
                    'packageUsdMembers': sum(sum(m['usdFamily'] for m in x.get('packageMembers', [])) for x in entries),
                    'lexicallyReferencedUsdFiles': sum(bool(x['referencedByTextCandidates']) for x in entries)},
        'assets': entries, 'documents': document_entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result['summary'], indent=2))


if __name__ == '__main__': main()
