// The Python side of running a script as `python3 <script> <args...>` does
// (runScript.ts in Node, browser.ts in a page): `_run_script(script, argv,
// workdir)` sets sys.argv and the working directory, runs the script as a
// module and calls its main(argv) if it has one (else it runs as
// __main__), capturing stdout and stderr. Its result: the exit code, the
// output and main's return value.
export const SCRIPT_RUNNER = `
import sys, io, os, runpy, traceback
def _run_script(script, argv, workdir):
    os.chdir(workdir)
    sys.argv = [script] + list(argv)
    script_dir = os.path.dirname(script)
    sys.path.insert(0, script_dir)
    out = io.StringIO()
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = out
    code = 0
    outputs = None
    try:
        ns = runpy.run_path(script, run_name='__not_main__')
        if 'main' in ns:
            outputs = ns['main'](list(argv))
        else:
            runpy.run_path(script, run_name='__main__')
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
    except BaseException:
        traceback.print_exc()
        code = 1
    finally:
        sys.stdout, sys.stderr = old_out, old_err
        sys.path.remove(script_dir)
    return {'exitCode': code, 'output': out.getvalue(), 'outputs': outputs}
`
