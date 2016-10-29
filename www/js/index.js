function __decorate(decorators,target,key,desc){var c=arguments.length,r=c<3?target:desc===null?desc=Object.getOwnPropertyDescriptor(target,key):desc,d;if(typeof Reflect==="object"&&typeof Reflect.decorate==="function")r=Reflect.decorate(decorators,target,key,desc);else for(var i=decorators.length-1;i>=0;i--)if(d=decorators[i])r=(c<3?d(r):c>3?d(target,key,r):d(target,key))||r;return c>3&&r&&Object.defineProperty(target,key,r),r}
let raf=window.requestAnimationFrame;if(raf){raf=raf.bind(window)}
else{raf=((cb)=>setTimeout(cb,16))}
class ReactionLoop{constructor(){this.scheduled=!1;this.nextFlushCbs=[];this.raf=raf;this.flushReactions=()=>{let temp=globals.pendingReactions;while(temp[0]){temp[0].onInvalidate();temp=temp[1]}
globals.pendingReactions=temp;ReactionLoop.flushId++;this.scheduled=!1;this.nextFlushCbs.forEach((v)=>v())}}
static onNextFlush(f){globals.loop.nextFlushCbs.push(f)}
static testSync(f){globals.loop=new ReactionLoop();globals.loop.raf=(cb)=>cb();f();globals.loop.scheduleFlush();globals.loop.raf=window.requestAnimationFrame||((cb)=>setTimeout(cb,16))}
scheduleFlush(){if(!this.scheduled){this.scheduled=!0;this.raf(this.flushReactions)}}}
ReactionLoop.flushId=0;var globals={allowChanges:!1,loop:new ReactionLoop(),pendingReactions:[],runningReactions:[],tracking:!1};class Atom{constructor(name=''){this.observers=[];this.name=name}
view(){const reaction=globals.runningReactions[0];if(reaction){this.observers.push(reaction)}}
change(){const flushId=ReactionLoop.flushId;for(let i=0;i<this.observers.length;i++){const reaction=this.observers[i];if(reaction.disposed){this.observers.splice(i,1);i--;continue}
if(reaction.lastFlushId!==flushId){reaction.lastFlushId=flushId;globals.pendingReactions=[reaction,globals.pendingReactions]}}}}
class Reaction{constructor(onInvalidate,name=''){this.disposed=!1;this.onInvalidate=onInvalidate;this.name=name}
track(f){globals.tracking=!0;globals.runningReactions=[this,globals.runningReactions];f();globals.runningReactions=globals.runningReactions[1];globals.tracking=!1}
dispose(){this.disposed=!0}}
function baseAction(name,f,scope){return function(){globals.allowChanges=!0;let result=f.apply(scope,arguments);globals.allowChanges=!1;globals.loop.scheduleFlush();return result}}
function action(f,key){if(typeof f==='function'&&typeof key!=='string'){return baseAction(f.name,f,this)}
else if(typeof key==='string'){let base=f[key];Object.defineProperty(f,key,{get(){return baseAction(f,base,this)}});return{get(){return baseAction(f,base,this)}}}}
const isState=Symbol('I am already a state');const registery=Symbol('registery');function objToState(v){const registery=new Map();v[isState]=!0;if(Array.isArray(v)){registery.set('length',new Atom(`Array.length`));for(let i=0;i<v.length;i++){v[i]=makeState(v[i]);registery.set(i.toString(),new Atom(`Array[${i}]`))}}
else{const keys=Object.keys(v);for(let i=0;i<keys.length;i++){const key=keys[i];v[key]=makeState(v[key]);registery.set(key,new Atom(`Object.${key}`))}}
return new Proxy(v,{get(target,prop){if(registery.has(prop)){registery.get(prop).view()}
return target[prop]},set(target,prop,value){if(!globals.allowChanges){throw new Error('You cannot change data outside of an action tag')}
target[prop]=makeState(value);if(registery.has(prop)){registery.get(prop).change()}
else{registery.set(prop,new Atom(Array.isArray(value)?`Array[${prop}]`:`Object.${prop}`))}
return!0}})}
function makeState(v){if(v==null){return v}
return!v[isState]&&typeof v==='object'?objToState(v):v}
class Value{constructor(val,name){this.val=makeState(val);this.atom=new Atom(name)}
get(){this.atom.view();return this.val}
set(newVal){if(!globals.allowChanges){throw new Error('You cannot change data outside of an action tag')}
if(newVal===this.val){return}
this.val=makeState(newVal);this.atom.change()}}
let id=0;function getNextId(){return ++id}
function initThis(instance,key,val){if(!instance[registery]){instance[registery]={id:getNextId(),initialized:new Map(),values:new Map()}}
if(!instance[registery].initialized.get(key)){instance[registery].values.set(key,new Value(val,`${instance.constructor.name}.${key}`));instance[registery].initialized.set(key,!0)}}
function decorate(target,prop){target[isState]=!0;let descriptor={configurable:!0,enumerable:!0,get(){initThis(this,prop);return this[registery].values.get(prop).get()},set(v){if(!this[registery]||!this[registery].initialized.has(prop)){initThis(this,prop,v)}
else{this[registery].values.get(prop).set(v)}}};Object.defineProperty(target,prop,descriptor)}
function state(v,prop){if(prop==null){return new Value(v)}
decorate(v,prop)}
function isEventHandler(str){return str.charCodeAt(0)===111&&str.charCodeAt(1)===110}
function setStyle(vnode,style){const keys=Object.keys(style);vnode.styleReactions={};for(let i=0;i<keys.length;i++){const key=keys[i];const val=style[key];if(typeof val==='function'){function update(){vnode.dom.style[key]=val()}
vnode.styleReactions[key]=new Reaction(update);vnode.styleReactions[key].track(update);continue}
vnode.dom.style[key]=val}}
function updateProp(key,initVal,vnode,val){if(key==='className'){const dom=vnode.dom;return function(){dom.className=val()}}
if(key==='style'){return function(){setStyle(vnode,val())}}
if(typeof initVal==='boolean'){return function(){let newval=val();if(newval){vnode.dom.setAttribute(key,'true')}
vnode.dom[key]=newval}}
return function(){vnode.dom.setAttribute(key,val())}}
function setProp(vnode,key,val){if(typeof val==='boolean'){if(val){vnode.dom.setAttribute(key,'true')}
vnode.dom[key]=val;return}
if(key==='style'&&typeof val==='object'){setStyle(vnode,val);return}
if(key==='className'){vnode.dom.className=val;return}
if(isEventHandler(key)){vnode.dom.addEventListener(key.slice(2),val);return}
vnode.dom.setAttribute(key,val)}
function setProps(vnode){const props=vnode.vElement.props;const propKeys=Object.keys(props);vnode.propReactions={};for(let i=0;i<propKeys.length;i++){const key=propKeys[i];const val=props[key];if(typeof val==='function'&&!isEventHandler(key)){let update=updateProp(key,val(),vnode,val);vnode.propReactions[key]=new Reaction(()=>vnode.propReactions[key].track(update));vnode.propReactions[key].track(update);continue}
setProp(vnode,key,props[key])}}
class Component{constructor(props){this.props=props}
render(props){return{children:[],props:{},tag:'div'}}}
function toVNode(xel,inSvgNS){if(typeof xel==='string'){return{isSvg:inSvgNS,text:xel,type:1}}
else if(xel.hasOwnProperty('tag')){const isSvg=inSvgNS||xel.tag==='svg';let vnode={children:[],isSvg,type:0,vElement:xel};const length=xel.children.length;for(let i=0;i<length;i++){vnode.children[i]=toVNode(xel.children[i],isSvg)}
return vnode}
else if(xel instanceof Component){return{instance:xel,isSvg:inSvgNS,type:2}}
else{return{baseRender:xel,isSvg:inSvgNS,type:3}}}
function update(vnode){let core=vnode.baseRender;function baseRender(){let result;vnode.reaction.track(()=>{result=core()});return result}
vnode.baseRender=baseRender;return function(){const next=toVNode(vnode.baseRender(),vnode.isSvg);const prev=vnode.vnode;if(prev.type===1&&next.type===1){updateText(prev,next,vnode)}
else if(prev.type===1){simpleReplaceUpdate(prev,next,vnode)}
else{unMount(prev);simpleReplaceUpdate(prev,next,vnode)}}}
function updateText(prev,next,dynamic){const dom=prev.dom;const text=next.text;next.dom=prev.dom;dynamic.vnode=next;if(text!==prev.text){dom.nodeValue=text}}
function simpleReplaceUpdate(prev,next,dynamic){let prevDom=prev.type===2?prev.vnode.dom:prev.dom;prevDom.parentNode.replaceChild(vNodeToDom(next),prevDom);dynamic.vnode=next}
function unMount(vnode){switch(vnode.type){case 0:unMountEl(vnode);case 1:return;case 2:unMount(vnode.vnode);vnode.instance.onUnMount&&vnode.instance.onUnMount();break;case 3:unMount(vnode.vnode)}}
function unMountEl(vnode){if(vnode.propReactions){const propKeys=Object.keys(vnode.propReactions);for(let i=0;i<propKeys.length;i++){vnode.propReactions[propKeys[i]].dispose()}}
if(vnode.styleReactions){const styleKeys=Object.keys(vnode.styleReactions);for(let i=0;i<styleKeys.length;i++){vnode.styleReactions[styleKeys[i]].dispose()}}
for(let i=0;i<vnode.children.length;i++){unMount(vnode.children[i])}}
function createElement(tag,isSvg){let dom;if(isSvg){dom=document.createElementNS('http://www.w3.org/2000/svg',tag)}
else{dom=document.createElement(tag)}
return dom}
function vNodeToDom(vnode){switch(vnode.type){case 0:return mountElementNode(vnode);case 1:return vnode.dom=document.createTextNode(vnode.text);case 2:return mountComponentVNode(vnode);case 3:return mountDynamicVNode(vnode)}}
function mountDynamicVNode(vnode){vnode.reaction=new Reaction(update(vnode));let newVel;vnode.reaction.track(function(){newVel=vnode.baseRender()});const newVNode=toVNode(newVel,vnode.isSvg);vnode.vnode=newVNode;let dom=vNodeToDom(newVNode);newVNode.dom=dom;return dom}
function mountComponentVNode(vnode){const xel=vnode.instance.render(vnode.instance.props);const renderVNode=toVNode(xel,vnode.isSvg);vnode.vnode=renderVNode;const dom=vNodeToDom(renderVNode);vnode.instance.onMount&&vnode.instance.onMount();return dom}
function mountElementNode(vnode){let dom=createElement(vnode.vElement.tag,vnode.isSvg);vnode.dom=dom;setProps(vnode);appendVNodeChildren(vnode);return dom}
function appendVNodeChildren(vnode){for(let i=0;i<vnode.children.length;i++){vnode.dom.appendChild(vNodeToDom(vnode.children[i]))}}
function render(xel,dom){dom.appendChild(vNodeToDom(toVNode(xel,!1)))}
function h(tag,props,children){if(Array.isArray(props)){children=props;props={}}
else if(!Array.isArray(children)){children=[]}
return{tag,props,children}}
const tags=new Proxy({},{get(target,prop){return h.bind(null,prop)}});function matches(urlSegments,pathSegments){if(urlSegments.length!==pathSegments.length){return!1}
for(let i=0;i<urlSegments.length;i++){if(pathSegments[i][0]===':'){continue}
if(pathSegments[i]!==urlSegments[i]){return!1}}
return!0}
class Router{constructor(){this.back=history.back.bind(history);this.forward=history.forward.bind(history);this.go=history.go.bind(history);this.url=window.location.pathname;this.push=(title,testing)=>{this.setUrl(title);if(!testing){window.history.pushState({},'',title)}}}
get urlSegments(){let url=this.url;if(url[0]==='/'){url=url.substring(1)}
if(url.indexOf('?')>-1){url=url.substring(0,url.indexOf('?'))}
return url.split('/')}
get queries(){if(this.url.indexOf('?')===-1){return{}}
let queries={};let pairs=this.url.substring(this.url.indexOf('?')+1).split('&');for(let i=0;i<pairs.length;i++){let[key,value]=pairs[i].split('=');if(typeof key==='string'){queries[key]=value}}
return queries}
getParams(path){path=path[0]==='/'?path.substring(1):path;const pathSegments=path.split('/');if(!matches(this.urlSegments,pathSegments)){return{}}
let params={};for(let i=0;i<pathSegments.length;i++){if(pathSegments[i][0]===':'){params[pathSegments[i].substring(1)]=this.urlSegments[i]}}
return params}
setUrl(url){this.url=url}}
__decorate([state],Router.prototype,"url",void 0);__decorate([action],Router.prototype,"setUrl",null);const router=new Router();window.onpopstate=()=>{router.setUrl(window.location.pathname)};let{button,div:div$1,h2,input}=tags;const styles$1={addBMButton:{background:'#80CBC4',border:'1px solid #26A69A',borderRadius:'.5em',fontSize:'1em',marginTop:'.3em',padding:'1em'},bodyMotion:{fontSize:'1.3em',height:'2em',margin:'.25em',textAlign:'center',width:'4em'},bodyMotionWrapper:{alignItems:'center',display:'flex',flexFlow:'column'},header:{marginBottom:'.2em',marginTop:'.2em'},taInput:{fontSize:'1.7em',height:'2em',textAlign:'center',width:'4em'},taWrapper:{alignItems:'center',background:'#BF360C',borderRadius:'.2em',boxShadow:'0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',display:'flex',flexFlow:'column',fontSize:'4em',padding:'.4em'}};function formatBM(bm){return bm==='0'?'':bm}
const handleKeyPress=(session,index)=>action(function(e){const charCode=e.which?e.which:e.keyCode;if(charCode===13){const parsed=parseFloat(e.target.value);if(!isNaN(parsed)){session.updateBodyMotion(index,parsed)}
const length=session.bodyMotion.length;if(length-1===index){session.addBodyMotion();setTimeout(function(){document.getElementById(`body-motion-${length}`).focus()},20)}}
if(charCode===46&&e.srcElement.value.split('.').length>1){return!1}
if(charCode!==46&&charCode>31&&(charCode<48||charCode>57)){return!1}
return!0});const bodyMotion=({index,session})=>input({id:'body-motion-'+index,onkeypress:handleKeyPress(session,index),style:styles$1.bodyMotion,value:()=>formatBM(session.bodyMotion[index].toString())});const sessionTA=(session)=>div$1({style:styles$1.taWrapper},[h2({style:styles$1.header},['Base TA']),input({oninput:session.changeTa,style:styles$1.taInput,type:'number',value:()=>session.baseTA.toString()}),button({onclick:session.addBodyMotion,style:styles$1.addBMButton},['Add Body Motion']),()=>div$1({style:styles$1.bodyMotionWrapper},session.bodyMotion.map((_,index)=>bodyMotion({index,session})))]);function prettyHours(hrs){const base=Math.trunc(hrs/60);if(base===0){return '12'}
return base.toString()}
function prettyMins(mins){return(mins%60).toString()}
function getDiff(a,b){const valA=a.mins+(a.am?0:720)+a.hrs*60;const valB=b.mins+(b.am?0:720)+b.hrs*60;return valA>valB?valA-valB:0}
function round(num){return Math.round(num*100)/100}
function curry(f){const scope=this;function curried(){return arguments.length<f.length?curried.bind(scope,...arguments):f.apply(scope,arguments)}
return curried}
const reduce=curry(function reduce(f,init,arr){let acc=init;for(let i=0;i<arr.length;i++){acc=f(acc,arr[i])}
return acc});const sum=curry(function sum(a,b){return a+b});const assign=Object.assign.bind(Object);let{input:input$1,div:div$3,button:button$2,h2:h2$1}=tags;const styles$3={amPm:{background:'#80CBC4',border:'1px solid #26A69A',borderRadius:'.5em',fontSize:'.8em',height:'4em',padding:'1em',width:'4em'},h2:{marginBottom:'.2em',marginTop:'.2em'},hrs:{borderRadius:'.5em',fontSize:'1em',marginRight:'.5em',textAlign:'center',width:'4em',},inputWrapper:{display:'flex',flexFlow:'row',justifyContent:'center'},mainWrapper:{alignItems:'center',background:'#BF360C',borderRadius:'.2em',boxShadow:'0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',display:'flex',flexFlow:'column',fontSize:'4em',margin:'.1em',padding:'.2em',},mins:{borderRadius:'.5em',fontSize:'1em',marginRight:'.5em',textAlign:'center',width:'4em'}};const changeHrs=(time)=>action(function(e){const parsed=parseInt(e.target.value,10);if(parsed>12||parsed<0){e.target.value=prettyHours(time.hrs)}
else if(parsed===13){time.hrs=1}
else if(!isNaN(parsed)){time.hrs=parsed}});const changeMins=(time)=>action(function(e){const parsed=parseInt(e.target.value,10);if(parsed>60||parsed<0){e.target.value=prettyMins(time.mins)}
else{time.mins=parsed}});const toggleAm=(time)=>action(function(){time.am=!time.am});const timeEditor=({time,label})=>{const hrsProps={max:12,min:0,oninput:changeHrs(time),style:styles$3.hrs,type:'number',value:()=>prettyHours(time.hrs)};const minsProps={max:60,min:0,oninput:changeMins(time),style:styles$3.mins,type:'number',value:()=>prettyMins(time.mins)};const amPmProps={onclick:toggleAm(time),style:styles$3.amPm};return div$3({style:styles$3.mainWrapper},[h2$1({style:styles$3.h2},[label]),div$3({style:styles$3.inputWrapper},[input$1(hrsProps),input$1(minsProps),button$2(amPmProps,[()=>time.am?'AM':'PM'])])])};let{div:div$2,button:button$1}=tags;const styles$2={addBreak:{background:'#80CBC4',border:'#26A69A',borderRadius:'.5em',boxShadow:'0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',fontSize:'6em',padding:'1em'},breakItem:{margin:'1em'},breaksWrapper:{alignItems:'center',borderRadius:'.2em',display:'flex',flexFlow:'column',marginTop:'.2em',overflow:'hidden',padding:'.4em'},sessionWrapper:{marginBottom:'1em',padding:'1em'}};const breakItem=(store)=>div$2({style:styles$2.breakItem},[timeEditor({label:'start',time:store.start}),timeEditor({label:'end',time:store.end})]);const breaks=(store)=>()=>div$2({style:styles$2.breaksWrapper},[button$1({onclick:store.addBreak,style:styles$2.addBreak},['Add a break']),...store.breaks.map(breakItem)]);const sessionTime=(store)=>div$2({style:styles$2.sessionWrapper},[timeEditor({label:'start',time:store.start}),breaks(store),timeEditor({label:'end',time:store.end})]);class Break{constructor(){this.start={am:!0,hrs:0,mins:0};this.end={am:!0,hrs:0,mins:0}}
get duration(){return getDiff(this.end,this.start)}}
__decorate([state],Break.prototype,"start",void 0);__decorate([state],Break.prototype,"end",void 0);class Session{constructor(){this.baseTA=0;this.bodyMotion=[];this.breaks=[];this.end={am:!0,hrs:0,mins:0};this.start={am:!0,hrs:0,mins:0}}
get totalTA(){return this.baseTA-reduce(sum,0,this.bodyMotion)}
get totalBreaks(){return reduce((acc,v)=>sum(acc,v.duration),0,this.breaks)}
get totalTime(){return getDiff(this.end,this.start)-this.totalBreaks}
get prettyTotal(){const hrs=Math.trunc(this.totalTime/60).toString();const mins=(this.totalTime%60).toString();return `${hrs.length === 1 ? '0' + hrs : hrs}:${mins.length === 1 ? '0' + mins : mins}`}
get perHour(){if(this.totalTime===0||this.totalTA===0){return 0}
return round((this.totalTA/this.totalTime)*60)}
addBreak(){this.breaks.push(new Break())}
changeTa(e){this.baseTA=parseFloat(e.target.value)}
addBodyMotion(){this.bodyMotion.push(0)}
updateBodyMotion(index,val){this.bodyMotion[index]=val}}
__decorate([state],Session.prototype,"baseTA",void 0);__decorate([state],Session.prototype,"bodyMotion",void 0);__decorate([state],Session.prototype,"breaks",void 0);__decorate([state],Session.prototype,"end",void 0);__decorate([state],Session.prototype,"start",void 0);__decorate([action],Session.prototype,"addBreak",null);__decorate([action],Session.prototype,"changeTa",null);__decorate([action],Session.prototype,"addBodyMotion",null);__decorate([action],Session.prototype,"updateBodyMotion",null);let{div,h4}=tags;const styles={h4:{margin:'.25em'},mainWrapper:{display:'flex',flexFlow:'column'},totalWrapper:{alignItems:'center',background:'#FFC107',borderRadius:'.2em',boxShadow:'0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',display:'flex',flexFlow:'column',fontSize:'4em',marginTop:'.2em',padding:'.3em'}};const total=(session)=>div({style:styles.totalWrapper},[h4({style:styles.h4},['Total Time: ',()=>session.prettyTotal]),h4({style:styles.h4},['Total TA: ',()=>round(session.totalTA).toString()]),h4({style:styles.h4},['TA Per Hour: ',()=>session.perHour.toString()])]);const main=(session)=>div({},[div({style:styles.mainWrapper},[sessionTime(session),sessionTA(session)]),total(session)]);render(main(new Session()),document.getElementById('root'))