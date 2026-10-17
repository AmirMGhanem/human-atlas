// Writes public/licenses.json: the licence text of every package in the app's production dependency tree.
// Run: node scripts/build-licenses.mjs
// Walks root "dependencies" only (no devDependencies), recursively, resolving nested node_modules the way Node does.
import {existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync} from 'node:fs';
import {basename, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('..',import.meta.url));
const OUT=join(ROOT,'public','licenses.json');
const LICENSE_FILE=/^(licen[sc]e|copying)(\.(md|txt))?$/i;

const readJson=p=>JSON.parse(readFileSync(p,'utf8'));

// Node resolution: check node_modules/<name> in the directory and each ancestor, skipping node_modules dirs themselves.
function resolvePackageDir(name,fromDir){
 let dir=fromDir;
 for(;;){
  if(basename(dir)!=='node_modules'){
   const candidate=join(dir,'node_modules',name);
   if(existsSync(join(candidate,'package.json')))return candidate;
  }
  const parent=dirname(dir);
  if(parent===dir)return null;
  dir=parent;
 }
}

function licenseOf(pkg){
 const l=pkg.license??pkg.licenses;
 if(typeof l==='string')return l;
 if(Array.isArray(l)){
  const types=l.map(x=>(typeof x==='string'?x:x?.type)).filter(Boolean);
  return types.length?types.join(' OR '):'UNKNOWN';
 }
 if(l&&typeof l.type==='string')return l.type;
 return 'UNKNOWN';
}

function textOf(dir,pkg,license){
 const file=readdirSync(dir)
  .filter(f=>LICENSE_FILE.test(f)&&statSync(join(dir,f)).isFile())
  .sort()[0];
 if(file)return readFileSync(join(dir,file),'utf8');
 return `${license} — see package ${pkg.name}@${pkg.version}`;
}

const packages=new Map(); // name@version → entry
const visited=new Set();  // real package directories already walked
const missing=[];

function walk(pkgDir,requiredBy){
 const real=realpathSync(pkgDir);
 if(visited.has(real))return;
 visited.add(real);
 const pkg=readJson(join(real,'package.json'));
 const key=`${pkg.name}@${pkg.version}`;
 if(!packages.has(key)){
  const license=licenseOf(pkg);
  packages.set(key,{name:pkg.name,version:pkg.version,license,text:textOf(real,pkg,license)});
 }
 for(const dep of Object.keys(pkg.dependencies??{})){
  const depDir=resolvePackageDir(dep,real);
  if(!depDir){missing.push(`${dep} (required by ${key})`);continue;}
  walk(depDir,key);
 }
}

const rootPkg=readJson(join(ROOT,'package.json'));
for(const dep of Object.keys(rootPkg.dependencies??{})){
 const depDir=resolvePackageDir(dep,ROOT);
 if(!depDir){missing.push(`${dep} (root dependency)`);continue;}
 walk(depDir,'root');
}

if(missing.length){
 console.error('Cannot resolve packages:\n  '+missing.join('\n  '));
 process.exit(1);
}

const list=[...packages.values()].sort((a,b)=>
 a.name<b.name?-1:a.name>b.name?1:a.version<b.version?-1:a.version>b.version?1:0);
const json=JSON.stringify(list);
mkdirSync(dirname(OUT),{recursive:true});
writeFileSync(OUT,json);
console.log(`licenses.json: ${list.length} packages, ${Buffer.byteLength(json)} bytes -> public/licenses.json`);
