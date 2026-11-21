// Command-line entry of runScript.ts (see there).
import { main } from './runScript.ts'

main(process.argv.slice(2)).then(code => process.exit(code), err => { console.error(err); process.exit(1) })
