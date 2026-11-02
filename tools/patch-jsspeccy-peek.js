/**
 * Idempotent patch: add peekMemory bridge to vendored JSSpeccy.
 */
import fs from 'fs'

const WORKER = 'public/jsspeccy/jsspeccy-worker.js'
const MAIN = 'public/jsspeccy/jsspeccy.js'

const WORKER_NEEDLE =
  'case"setTapeTraps":o.setTapeTraps(e.data.value);break;default:console.log("message received by worker:",e.data)'
const WORKER_REPL =
  'case"setTapeTraps":o.setTapeTraps(e.data.value);break;case"peekMemory":(()=>{if(!o){postMessage({message:"peekMemoryResult",id:e.data.id,error:"no core"});return}const t=e.data.ranges||[{start:e.data.start||0,length:e.data.length||1}],s=[];for(const n of t){const a=n.start&65535,r=Math.max(0,Math.min(n.length|0,65536)),i=new Uint8Array(r);for(let e=0;e<r;e++)i[e]=o.peek(a+e&65535);s.push({start:a,length:r,data:i})}postMessage({message:"peekMemoryResult",id:e.data.id,ranges:s.map((e=>({start:e.start,length:e.length,data:e.data}))),pc:o.getPC(),halted:!!o.getHalted(),registers:{AF:u[0],BC:u[1],DE:u[2],HL:u[3],AF_:u[4],BC_:u[5],DE_:u[6],HL_:u[7],IX:u[8],IY:u[9],SP:u[10],IR:u[11]}})})();break;default:console.log("message received by worker:",e.data)'

const MAIN_CASE_NEEDLE =
  'case"stoppedTape":this.tapeIsPlaying=!1,this.emit("stoppedTape");break;default:console.log("message received by host:",e.data)'
const MAIN_CASE_REPL =
  'case"stoppedTape":this.tapeIsPlaying=!1,this.emit("stoppedTape");break;case"peekMemoryResult":{const t=this.peekMemoryResolutions[e.data.id];if(t){delete this.peekMemoryResolutions[e.data.id],t(e.data)}break}default:console.log("message received by host:",e.data)'

const MAIN_INIT_NEEDLE = 'this.fileOpenPromiseResolutions={},this.onReadyHandlers=[]'
const MAIN_INIT_REPL =
  'this.fileOpenPromiseResolutions={},this.peekMemoryResolutions={},this.nextPeekMemoryID=0,this.onReadyHandlers=[]'

const MAIN_METHOD_NEEDLE = 'exit(){this.pause(),this.worker.terminate()}'
const MAIN_METHOD_REPL =
  'peekMemory(e){const t=this.nextPeekMemoryID++,r=Array.isArray(e)?e:[{start:e.start||0,length:e.length||1}];return this.worker.postMessage({message:"peekMemory",id:t,ranges:r}),new Promise((e=>{this.peekMemoryResolutions[t]=e}))}exit(){this.pause(),this.worker.terminate()}'

const MAIN_API_NEEDLE =
  'isRunning:()=>a.isRunning,keyDown:(e)=>{a.keyboardHandler.keyDown(e)},keyUp:(e)=>{a.keyboardHandler.keyUp(e)},exit:()=>{a.exit(),l.unload()}'
const MAIN_API_REPL =
  'isRunning:()=>a.isRunning,keyDown:(e)=>{a.keyboardHandler.keyDown(e)},keyUp:(e)=>{a.keyboardHandler.keyUp(e)},peekMemory:(e)=>a.peekMemory(e),exit:()=>{a.exit(),l.unload()}'

function patch(path, needle, repl, label) {
  let src = fs.readFileSync(path, 'utf8')
  if (src.includes(repl) || src.includes('peekMemoryResult')) {
    // Already patched — check specific needle absence means ok
    if (src.includes('peekMemory') && label !== 'worker-case') {
      console.log('skip (already):', label)
      return src
    }
  }
  if (src.includes(repl)) {
    console.log('skip (exact):', label)
    return src
  }
  if (!src.includes(needle)) {
    throw new Error(`Needle not found for ${label} in ${path}`)
  }
  src = src.replace(needle, repl)
  fs.writeFileSync(path, src)
  console.log('patched:', label)
  return src
}

patch(WORKER, WORKER_NEEDLE, WORKER_REPL, 'worker-case')

let main = fs.readFileSync(MAIN, 'utf8')
if (!main.includes('peekMemoryResolutions')) {
  if (!main.includes(MAIN_INIT_NEEDLE)) throw new Error('init needle missing')
  main = main.replace(MAIN_INIT_NEEDLE, MAIN_INIT_REPL)
  console.log('patched: main-init')
} else console.log('skip (already): main-init')

if (!main.includes('case"peekMemoryResult"')) {
  if (!main.includes(MAIN_CASE_NEEDLE)) throw new Error('case needle missing')
  main = main.replace(MAIN_CASE_NEEDLE, MAIN_CASE_REPL)
  console.log('patched: main-case')
} else console.log('skip (already): main-case')

if (!main.includes('peekMemory(e){')) {
  if (!main.includes(MAIN_METHOD_NEEDLE)) throw new Error('method needle missing')
  main = main.replace(MAIN_METHOD_NEEDLE, MAIN_METHOD_REPL)
  console.log('patched: main-method')
} else console.log('skip (already): main-method')

if (!main.includes('peekMemory:(e)=>a.peekMemory(e)')) {
  if (!main.includes(MAIN_API_NEEDLE)) throw new Error('api needle missing')
  main = main.replace(MAIN_API_NEEDLE, MAIN_API_REPL)
  console.log('patched: main-api')
} else console.log('skip (already): main-api')

fs.writeFileSync(MAIN, main)
console.log('done')
