/* 运行校验：node tools/check.cjs。覆盖数量、资源、可复现性与算法边界。 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),L=require('../assets/lab/core.js'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ctx={window:{}};for(const p of ['assets/data.js','assets/core/registry.js','assets/cases/portfolio-bundle.js'])vm.runInNewContext(read(p),ctx);const cases=ctx.window.Cases.list(),atlas=ctx.window.ATLAS;
assert.equal(cases.length,63);assert.equal(new Set(cases.map(c=>c.id)).size,63);assert.equal(new Set(cases.map(c=>c.sceneId)).size,61);assert.equal(atlas.stages.length,13);assert.equal(atlas.allScenes.length,61);
let guides=0;for(const c of cases){assert.equal(c.tabs.workflow.steps.length,6);assert.ok(c.tabs.background.sections.length>=4);assert.equal(typeof c.tabs.demo.mount,'function');assert.ok(!ctx.window.Cases.validate(c).some(v=>v.level==='error'));for(const s of c.tabs.workflow.steps){assert.ok(s.figure?.image.startsWith('data:image/svg+xml;base64,'));let xml=Buffer.from(s.figure.image.split(',')[1],'base64').toString();assert.ok(xml.includes('<svg'));assert.ok(!xml.includes('NaN'));guides++;}}assert.equal(guides,378);
function finite(x,label){if(typeof x==='number')assert.ok(Number.isFinite(x),'非有限数值 '+label);else if(Array.isArray(x))x.forEach(y=>finite(y,label));else if(x&&typeof x==='object')Object.values(x).forEach(y=>finite(y,label));}
let added=0,runs=0;const configs=[];for(const dir of fs.readdirSync(path.join(root,'cases'))){let f='cases/'+dir+'/demo/demo.js';if(!fs.existsSync(path.join(root,f)))continue;let js=read(f);new vm.Script(js,{filename:f});if(!js.startsWith('window.LabCaseDefinition='))continue;let box={window:{}};vm.runInNewContext(js,box);let D=JSON.parse(JSON.stringify(box.window.LabCaseDefinition)),v=L.defaults(D),r=L.run(D,v),contrast=L.run(D,{...v,...D.contrast});configs.push(D);finite(r,D.slug);assert.deepEqual(L.run(D,v),r,'默认计算不可复现');assert.notEqual(JSON.stringify(r.metrics),JSON.stringify(contrast.metrics),'对照工况未改变评价 '+D.slug);added++;runs+=3;
for(const control of D.controls){for(const val of [control[2],control[3]]){let z=L.run(D,{...v,[control[0]]:val});finite(z,D.slug+'/'+control[0]);runs++;}}
if(D.type==='classification'||D.type==='glyph'){assert.equal(r.raw.conf.flat().reduce((a,b)=>a+b,0),54);assert.equal(r.raw.votes.reduce((a,b)=>a+b,0),7);}
if(D.type==='segment'){assert.equal(r.raw.tp+r.raw.fp+r.raw.fn+r.raw.tn,1280);let low=L.run(D,{...v,threshold:10}),high=L.run(D,{...v,threshold:90});assert.ok(low.raw.recall>=high.raw.recall);assert.ok(low.raw.fp>=high.raw.fp);}
if(D.type==='optimization'){assert.equal(L.run(D,{...v,budget:15}).raw.viable,0);}
if(D.type==='text'){assert.ok(L.run(D,{...v,record:1}).raw.missing.length>0);assert.ok(L.run(D,{...v,record:2}).raw.conflict);}
if(D.type==='retrieval')assert.equal(L.run(D,{...v,...D.contrast}).raw.available,0);
if(D.type==='audit'){assert.equal(r.raw.flagged,0);assert.ok(L.run(D,{...v,record:1}).raw.flagged>0);assert.ok(L.run(D,{...v,record:2}).raw.flagged>0);}
}
assert.equal(added,45);for(const file of ['assets/lab/ui.js','assets/core/own-ui.js','assets/core/shell.js','tools/build-cases.cjs','tools/package.cjs'])new vm.Script(read(file),{filename:file});
const Search=require('../assets/core/case-search.js'),index=Search.build(cases,atlas);
assert.equal(Search.find(index,{}).length,63);
assert.equal(Search.find(index,{q:'孔道预测'}).length,2);
assert.deepEqual(Search.find(index,{q:'KnN'}),Search.find(index,{q:'ｋＮＮ'}));
assert.ok(Search.find(index,{q:'岭回归 射孔'}).length>0);
assert.ok(Search.find(index,{q:'分层'}).some(r=>r.id==='edu08-w1-log-segmentation'));
assert.ok(Search.find(index,{q:'edu08-pr4-esp-warning'}).some(r=>r.id==='edu08-pr4-esp-warning'));
assert.equal(Search.find(index,{stage:'perforation'}).length,6);
assert.ok(Search.find(index,{method:'cv',stage:'welllog'}).every(r=>r.stage==='welllog'&&r.methods.includes('cv')));
assert.equal(Search.find(index,{q:'找不到的案例xyz0123'}).length,0);
assert.equal(Search.find(index,{q:'<script>alert(1)</script>'}).length,0);
assert.equal(Search.find(index,{q:'image/svg+xml;base64'}).length,0);
let imported={id:'local-review',sceneId:'g1',title:'本机盐析检索演示',methods:['cv'],tabs:{background:{sections:[{title:'独有材料',html:'<p>蒸发结晶线索</p>'}]}}};
assert.equal(Search.find(Search.build(cases.concat(imported),atlas),{q:'蒸发结晶'}).length,1);
let noEvent=configs.find(d=>d.type==='anomaly');assert.equal(L.run(noEvent,{...L.defaults(noEvent),amplitude:0}).raw.delay,null);
console.log(JSON.stringify({registeredCases:cases.length,coveredScenes:61,guides,newCases:added,modelRuns:runs,searchChecks:12,registryErrors:0,result:'通过'},null,2));
