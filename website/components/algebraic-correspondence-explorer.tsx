'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import katex from 'katex';
import { Button } from '@/components/ui/button';
import { formatComplex, planePosition } from '@/lib/dynamics';
import type { Complex, PlaneView } from '@/lib/dynamics';
import {
  correspondenceCriticalData,
  finiteSpherePoint,
  parameterBand,
  solveCorrespondenceFibre,
} from '@/lib/correspondence-algebraic';
import type { CorrespondenceMode, SpherePoint, WindingGrid } from '@/lib/correspondence-algebraic';
import type { OrbitTree, SurvivalGrid } from '@/lib/correspondence-survival';
import {
  BRANCH_TRACKING_CAUTION,
  CORRESPONDENCE_ALL_FORMULA,
  CORRESPONDENCE_EXISTS_FORMULA,
  CORRESPONDENCE_FIBRE_FORMULA,
  CORRESPONDENCE_MODE_BADGES,
  FINITE_DEPTH_CAUTION,
  RAMIFIED_MODE_CAUTION,
  describeCorrespondenceFibre,
  describeParameterBand,
  survivalColour,
  windingColour,
} from '@/lib/correspondence-algebraic-display';
import type { SurvivalLayer } from '@/lib/correspondence-algebraic-display';

const VIEW: PlaneView = {re: 0, im: 0, span: 5};
const sheetColours = ['#b55239','#287b83','#63528a','#b7822c','#3e7658'];
const formula = (value: string) => katex.renderToString(value,{throwOnError:false,output:'htmlAndMathml'});

function finite(point: SpherePoint): Complex | null { return point.kind === 'finite' ? point.value : null; }
function position(view: PlaneView, point: Complex) { const at=planePosition(view,point); return {x:at.x*100,y:at.y*100}; }
function selectedFromEvent(event: ReactPointerEvent<HTMLElement>, view: PlaneView) {
  const box=event.currentTarget.getBoundingClientRect();
  return {re:view.re+((event.clientX-box.left)/box.width-.5)*view.span,im:view.im+(.5-(event.clientY-box.top)/box.height)*view.span};
}

function RasterCanvas({grid,kind,layer='combined'}:{grid:WindingGrid|SurvivalGrid|null;kind:'winding'|'survival';layer?:SurvivalLayer}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const canvas=ref.current;if(!canvas||!grid)return;const context=canvas.getContext('2d');if(!context)return;canvas.width=grid.size;canvas.height=grid.size;const data=context.createImageData(grid.size,grid.size);for(let i=0;i<grid.size*grid.size;i++){const colour=kind==='winding'?windingColour(grid as WindingGrid,i):survivalColour(grid as SurvivalGrid,i,layer);data.data[4*i]=colour[0];data.data[4*i+1]=colour[1];data.data[4*i+2]=colour[2];data.data[4*i+3]=255;}context.putImageData(data,0,0);},[grid,kind,layer]);
  return <canvas ref={ref} aria-hidden="true"/>;
}

function WindingPanel({grid,c,selected}:{grid:WindingGrid|null;c:number;selected:Complex}){
  const selectedW=grid?finite(solveCorrespondenceFibre(finiteSpherePoint(selected),c).w):null;
  const critical=correspondenceCriticalData(c).filter(item=>item.source==='finite');
  return <section className="algebraic-panel"><header><h3>Circle image and winding cells</h3><span><i>w</i>-plane</span></header><div className="algebraic-plot"><RasterCanvas grid={grid} kind="winding"/>{grid&&<svg viewBox="0 0 100 100" aria-label="The image of the unit circle, its critical values and selected w point"><polyline points={grid.curve.points.map(point=>{const p=position(grid.view,point);return `${p.x},${p.y}`;}).join(' ')} fill="none" stroke="#173d56" strokeWidth=".35" vectorEffect="non-scaling-stroke"/>{critical.map((item,index)=>{const value=finite(item.value);if(!value)return null;const p=position(grid.view,value);return <circle key={item.id} cx={p.x} cy={p.y} r=".7" fill="#b55239"><title>Critical value {index+1}</title></circle>;})}{grid.curve.intersections.map((hit,index)=>{const p=position(grid.view,hit.point);return <path key={index} d={`M${p.x-1},${p.y-1}L${p.x+1},${p.y+1}M${p.x+1},${p.y-1}L${p.x-1},${p.y+1}`} stroke="#7b3e77" strokeWidth=".45"><title>{hit.kind} of the circle image</title></path>;})}{selectedW&&(()=>{const p=position(grid.view,selectedW);return <circle cx={p.x} cy={p.y} r="1.1" fill="none" stroke="#111" strokeWidth=".5"><title>Selected w = R_c(x)</title></circle>;})()}</svg>} {!grid&&<span className="correspondence-plot-message">Computing winding cells…</span>}</div><div className="critical-inset"><strong>Finite critical points</strong><span>{critical.map(item=>{const point=finite(item.point);return point?formatComplex(point):'∞';}).join(' · ')}</span></div><p>Crosses mark detected self-intersections; grey is within the polygonal uncertainty band.</p></section>;
}

function FibrePanel({c,selected,onSelect}:{c:number;selected:Complex;onSelect:(point:Complex)=>void}){
  const fibre=useMemo(()=>solveCorrespondenceFibre(finiteSpherePoint(selected),c),[selected,c]);
  return <section className="algebraic-panel"><header><h3>Five correspondence images</h3><span>counted with multiplicity</span></header><div className="fibre-plane" role="img" aria-label="All residual-checked images of the selected point"><svg viewBox="0 0 100 100">{fibre.images.map((image,index)=>{const value=finite(image.y);if(!value)return <text key={image.id} x="50" y={12+index*8}>sheet {index+1}: ∞</text>;const p=position(VIEW,value);return <g key={image.id} role="button" tabIndex={0} onClick={()=>onSelect(value)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(value);}}}><circle cx={p.x} cy={p.y} r={1.8+Math.log2(image.multiplicity)} fill={sheetColours[index%sheetColours.length]} stroke="white" strokeWidth=".6"/><text x={p.x+2.4} y={p.y-2} fontSize="3.2">{index+1}</text></g>;})}</svg></div><p>{describeCorrespondenceFibre(fibre)}</p><div className="fibre-table" tabIndex={0} role="region" aria-label="Correspondence image residual table"><table><thead><tr><th>Sheet</th><th>ζ</th><th>y</th><th>Mult.</th><th>Residual</th></tr></thead><tbody>{fibre.images.map((image,index)=><tr key={image.id}><td><i style={{background:sheetColours[index%sheetColours.length]}}/>{index+1}</td><td>{image.zeta.kind==='finite'?formatComplex(image.zeta.value):'∞'}</td><td>{image.y.kind==='finite'?formatComplex(image.y.value):'∞'}</td><td>{image.multiplicity}</td><td>{Math.max(image.fibreResidual,image.relationResidual).toExponential(1)}</td></tr>)}</tbody></table></div></section>;
}

function TreePanel({tree,onSelect}:{tree:OrbitTree|null;onSelect:(point:Complex)=>void}){
  const visible=tree?.nodes.slice(0,180)??[];const levels=new Map<number,number[]>();for(const node of visible)levels.set(node.depth,[...(levels.get(node.depth)??[]),node.id]);const coord=(id:number)=>{const node=tree?.nodes[id];if(!node)return{x:0,y:0};const row=levels.get(node.depth)??[];return{x:8+84*node.depth/Math.max(1,tree!.requestedDepth),y:8+84*(row.indexOf(id)+.5)/Math.max(1,row.length)};};
  return <section className="algebraic-panel"><header><h3>Finite orbit tree</h3><span>{tree?`depth ${tree.computedDepth}/${tree.requestedDepth}`:'depth 3'}</span></header><div className="tree-plane">{tree?<svg viewBox="0 0 100 100" aria-label="Finite correspondence orbit tree">{tree.edges.filter(edge=>edge.from<visible.length&&edge.to<visible.length).map((edge,index)=>{const a=coord(edge.from),b=coord(edge.to);return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b8c2c6" strokeWidth={Math.min(1.2,.25+.15*edge.multiplicity)}/>;})}{visible.map(node=>{const p=coord(node.id),value=finite(node.value);return <g key={node.id} role={value?'button':undefined} tabIndex={value?0:undefined} onClick={()=>value&&onSelect(value)} onKeyDown={event=>{if(value&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onSelect(value);}}}><circle cx={p.x} cy={p.y} r={node.status==='capped'?1.8:1.25} fill={node.status==='inside'?'#287b83':node.status==='escaped'?'#d09962':'#aab2b9'}><title>{value?formatComplex(value):'∞'} · {node.status}</title></circle></g>;})}</svg>:<span className="correspondence-plot-message">Computing every branch…</span>}</div><p>{tree?.complete?'Every displayed fibre passed its residual checks.':tree?`Visible stop: ${tree.stopReason??'finite depth'}.`:'The root and every incoming branch remain identifiable.'} Node cap 5,000; deduplication tolerance 2×10⁻⁷.</p></section>;
}

function SurvivalPanel({grid,selected,onSelect,layer,setLayer}:{grid:SurvivalGrid|null;selected:Complex;onSelect:(point:Complex)=>void;layer:SurvivalLayer;setLayer:(layer:SurvivalLayer)=>void}){
  const p=position(VIEW,selected);
  return <section className="algebraic-panel"><header><h3>Finite-depth branch survival</h3><label>View <select value={layer} onChange={event=>setLayer(event.target.value as SurvivalLayer)}><option value="combined">Combined</option><option value="existential">Some branch</option><option value="universal">Every branch</option></select></label></header><div className="algebraic-plot interactive" role="application" tabIndex={0} aria-label="Finite-depth branch survival in the z-plane; click to select a point" onPointerDown={event=>onSelect(selectedFromEvent(event,VIEW))}><RasterCanvas grid={grid} kind="survival" layer={layer}/><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx={p.x} cy={p.y} r="1.2" fill="none" stroke="#111" strokeWidth=".5"/></svg>{!grid&&<span className="correspondence-plot-message">Computing finite-depth survival…</span>}</div><div className="survival-key"><span><i className="all"/>All survive</span><span><i className="some"/>Some survive</span><span><i className="none"/>All escape</span><span><i className="unresolved"/>Unresolved</span></div><p>{FINITE_DEPTH_CAUTION}</p></section>;
}

export default function AlgebraicCorrespondenceExplorer({mode}:{mode:Exclude<CorrespondenceMode,'verified-round'>}){
  const [c,setC]=useState(mode==='post-pinching'?0.72:3);
  const [selected,setSelected]=useState<Complex>({re:.35,im:.2});
  const [depth,setDepth]=useState(2);
  const [layer,setLayer]=useState<SurvivalLayer>('combined');
  const [winding,setWinding]=useState<WindingGrid|null>(null);
  const [survival,setSurvival]=useState<SurvivalGrid|null>(null);
  const [tree,setTree]=useState<OrbitTree|null>(null);
  const [progress,setProgress]=useState('');
  const request=useRef(0);
  useEffect(()=>{setC(mode==='post-pinching'?0.72:3);},[mode]);
  useEffect(()=>{
    const id=++request.current;setWinding(null);setSurvival(null);setTree(null);setProgress('Starting the three numerical checks…');
    const workers=(['winding','survival','tree'] as const).map(job=>{const worker=new Worker(new URL('../lib/correspondence-algebraic.worker.ts',import.meta.url),{type:'module'});worker.onmessage=({data})=>{if(data.requestId!==id)return;if(data.type==='progress')setProgress(`${data.job}: ${Math.round(data.progress*100)}%`);if(data.type==='result'){if(data.job==='winding')setWinding(data.result);if(data.job==='survival')setSurvival(data.result);if(data.job==='tree')setTree(data.result);worker.terminate();}};worker.onerror=()=>{setProgress('One numerical panel could not finish; change the parameter to retry.');worker.terminate();};const common={requestId:id,type:job,c,view:VIEW};worker.postMessage(job==='winding'?{...common,size:192}:job==='survival'?{...common,size:96,depth}: {...common,root:finiteSpherePoint(selected),depth:3,nodeCap:5000,dedupTolerance:2e-7});return worker;});return()=>workers.forEach(worker=>worker.terminate());
  },[c,depth,selected]);
  const valid=(value:number)=>mode==='post-pinching'?(value>-1&&value<3):(value<=-1||value>=3);
  const update=(value:number)=>{if(valid(value))setC(value);};
  const presets=mode==='post-pinching'?[-.8,-.6001,-.6,-.5999,.5999,.6,.6001,.8,2.8]:[-5,-1.2,-1,3,3.2,5];
  return <section className="algebraic-correspondence" aria-labelledby="algebraic-correspondence-title"><div className="algebraic-regime"><strong id="algebraic-correspondence-title">{CORRESPONDENCE_MODE_BADGES[mode]}</strong><span>{describeParameterBand(parameterBand(c))}</span></div>{mode==='ramified'&&<p className="algebraic-caution">{RAMIFIED_MODE_CAUTION}</p>}<div className="algebraic-controls"><label>Real parameter <i>c</i><input type="number" value={c} step="0.0001" onChange={event=>update(Number(event.target.value))}/></label><div className="preset-row">{presets.map(value=><Button key={value} variant="outline" size="sm" aria-pressed={c===value} onClick={()=>setC(value)}>c = {value}</Button>)}</div><label>Survival depth<select value={depth} onChange={event=>setDepth(Number(event.target.value))}>{[1,2,3].map(value=><option key={value}>{value}</option>)}</select></label></div><div className="algebraic-formulas"><span dangerouslySetInnerHTML={{__html:formula(CORRESPONDENCE_FIBRE_FORMULA)}}/><span dangerouslySetInnerHTML={{__html:formula(CORRESPONDENCE_EXISTS_FORMULA)}}/><span dangerouslySetInnerHTML={{__html:formula(CORRESPONDENCE_ALL_FORMULA)}}/></div><p className="algebraic-selection">Selected x = {formatComplex(selected)} · displayed square width {VIEW.span} · <span role="status" aria-live="polite">{progress}</span></p><div className="algebraic-grid"><WindingPanel grid={winding} c={c} selected={selected}/><FibrePanel c={c} selected={selected} onSelect={setSelected}/><TreePanel tree={tree} onSelect={setSelected}/><SurvivalPanel grid={survival} selected={selected} onSelect={setSelected} layer={layer} setLayer={setLayer}/></div><p className="algebraic-caution">{BRANCH_TRACKING_CAUTION}</p></section>;
}
