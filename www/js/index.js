function __decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}

let raf = window.requestAnimationFrame;
if (raf) {
    raf = raf.bind(window);
}
else {
    raf = ((cb) => setTimeout(cb, 16));
}
class ReactionLoop {
    constructor() {
        this.scheduled = false;
        this.nextFlushCbs = [];
        this.raf = raf;
        this.flushReactions = () => {
            let temp = globals.pendingReactions;
            while (temp[0]) {
                temp[0].onInvalidate();
                temp = temp[1];
            }
            globals.pendingReactions = temp;
            ReactionLoop.flushId++;
            this.scheduled = false;
            this.nextFlushCbs.forEach((v) => v());
        };
    }
    static onNextFlush(f) {
        globals.loop.nextFlushCbs.push(f);
    }
    static testSync(f) {
        globals.loop = new ReactionLoop();
        globals.loop.raf = (cb) => cb();
        f();
        globals.loop.scheduleFlush();
        globals.loop.raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
    }
    scheduleFlush() {
        if (!this.scheduled) {
            this.scheduled = true;
            this.raf(this.flushReactions);
        }
    }
}
ReactionLoop.flushId = 0;
var globals = {
    allowChanges: false,
    loop: new ReactionLoop(),
    pendingReactions: [],
    runningReactions: [],
    tracking: false
};
class Atom {
    constructor(name = '') {
        this.observers = [];
        this.name = name;
    }
    view() {
        const reaction = globals.runningReactions[0];
        if (reaction) {
            this.observers.push(reaction);
        }
    }
    change() {
        const flushId = ReactionLoop.flushId;
        for (let i = 0; i < this.observers.length; i++) {
            const reaction = this.observers[i];
            if (reaction.disposed) {
                this.observers.splice(i, 1);
                i--;
                continue;
            }
            if (reaction.lastFlushId !== flushId) {
                reaction.lastFlushId = flushId;
                globals.pendingReactions = [reaction, globals.pendingReactions];
            }
        }
    }
}
class Reaction {
    constructor(onInvalidate, name = '') {
        this.disposed = false;
        this.onInvalidate = onInvalidate;
        this.name = name;
    }
    track(f) {
        globals.tracking = true;
        globals.runningReactions = [this, globals.runningReactions];
        f();
        globals.runningReactions = globals.runningReactions[1];
        globals.tracking = false;
    }
    dispose() {
        this.disposed = true;
    }
}
function baseAction(name, f, scope) {
    return function () {
        globals.allowChanges = true;
        let result = f.apply(scope, arguments);
        globals.allowChanges = false;
        globals.loop.scheduleFlush();
        return result;
    };
}
function action(f, key) {
    if (typeof f === 'function' && typeof key !== 'string') {
        return baseAction(f.name, f, this);
    }
    else if (typeof key === 'string') {
        let base = f[key];
        // jest and wallaby treat these differently
        Object.defineProperty(f, key, {
            get() {
                return baseAction(f, base, this);
            }
        });
        return { get() { return baseAction(f, base, this); } };
    }
}

const isState = Symbol('I am already a state');
const registery = Symbol('registery');
function objToState(v) {
    const registery = new Map();
    v[isState] = true;
    if (Array.isArray(v)) {
        registery.set('length', new Atom(`Array.length`));
        for (let i = 0; i < v.length; i++) {
            v[i] = makeState(v[i]);
            registery.set(i.toString(), new Atom(`Array[${i}]`));
        }
    }
    else {
        const keys = Object.keys(v);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            v[key] = makeState(v[key]);
            registery.set(key, new Atom(`Object.${key}`));
        }
    }
    return new Proxy(v, {
        get(target, prop) {
            if (registery.has(prop)) {
                registery.get(prop).view();
            }
            return target[prop];
        },
        set(target, prop, value) {
            if (!globals.allowChanges) {
                throw new Error('You cannot change data outside of an action tag');
            }
            target[prop] = makeState(value);
            if (registery.has(prop)) {
                registery.get(prop).change();
            }
            else {
                registery.set(prop, new Atom(Array.isArray(value) ? `Array[${prop}]` : `Object.${prop}`));
            }
            return true;
        }
    });
}
function makeState(v) {
    if (v == null) {
        return v;
    }
    return !v[isState] && typeof v === 'object' ?
        objToState(v) :
        v;
}
class Value {
    constructor(val, name) {
        this.val = makeState(val);
        this.atom = new Atom(name);
    }
    get() {
        this.atom.view();
        return this.val;
    }
    set(newVal) {
        if (!globals.allowChanges) {
            throw new Error('You cannot change data outside of an action tag');
        }
        if (newVal === this.val) {
            return;
        }
        this.val = makeState(newVal);
        this.atom.change();
    }
}
let id = 0;
function getNextId() {
    return ++id;
}
function initThis(instance, key, val) {
    if (!instance[registery]) {
        instance[registery] = {
            id: getNextId(),
            initialized: new Map(),
            values: new Map()
        };
    }
    if (!instance[registery].initialized.get(key)) {
        instance[registery].values.set(key, new Value(val, `${instance.constructor.name}.${key}`));
        instance[registery].initialized.set(key, true);
    }
}
function decorate(target, prop) {
    target[isState] = true;
    let descriptor = {
        configurable: true,
        enumerable: true,
        get() {
            initThis(this, prop);
            return this[registery].values.get(prop).get();
        },
        set(v) {
            if (!this[registery] || !this[registery].initialized.has(prop)) {
                initThis(this, prop, v);
            }
            else {
                this[registery].values.get(prop).set(v);
            }
        }
    };
    Object.defineProperty(target, prop, descriptor);
}
function state(v, prop) {
    if (prop == null) {
        return new Value(v);
    }
    decorate(v, prop);
}

function isEventHandler(str) {
    // if first two letters are 'on'
    return str.charCodeAt(0) === 111 && str.charCodeAt(1) === 110;
}
function setStyle(vnode, style) {
    const keys = Object.keys(style);
    vnode.styleReactions = {};
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const val = style[key];
        if (typeof val === 'function') {
            function update() {
                vnode.dom.style[key] = val();
            }
            vnode.styleReactions[key] = new Reaction(update);
            vnode.styleReactions[key].track(update);
            continue;
        }
        vnode.dom.style[key] = val;
    }
}
function updateProp(key, initVal, vnode, val) {
    if (key === 'className') {
        const dom = vnode.dom;
        return function () { dom.className = val(); };
    }
    if (key === 'style') {
        return function () { setStyle(vnode, val()); };
    }
    if (typeof initVal === 'boolean') {
        return function () {
            let newval = val();
            if (newval) {
                vnode.dom.setAttribute(key, 'true');
            }
            vnode.dom[key] = newval;
        };
    }
    return function () { vnode.dom.setAttribute(key, val()); };
}
function setProp(vnode, key, val) {
    if (typeof val === 'boolean') {
        if (val) {
            vnode.dom.setAttribute(key, 'true');
        }
        vnode.dom[key] = val;
        return;
    }
    if (key === 'style' && typeof val === 'object') {
        setStyle(vnode, val);
        return;
    }
    if (key === 'className') {
        vnode.dom.className = val;
        return;
    }
    if (isEventHandler(key)) {
        vnode.dom.addEventListener(key.slice(2), val);
        return;
    }
    vnode.dom.setAttribute(key, val);
}
function setProps(vnode) {
    const props = vnode.vElement.props;
    const propKeys = Object.keys(props);
    vnode.propReactions = {};
    for (let i = 0; i < propKeys.length; i++) {
        const key = propKeys[i];
        const val = props[key];
        if (typeof val === 'function' && !isEventHandler(key)) {
            let update = updateProp(key, val(), vnode, val);
            vnode.propReactions[key] = new Reaction(() => vnode.propReactions[key].track(update));
            vnode.propReactions[key].track(update);
            continue;
        }
        setProp(vnode, key, props[key]);
    }
}

class Component {
    constructor(props) {
        this.props = props;
    }
    render(props) {
        return {
            children: [],
            props: {},
            tag: 'div'
        };
    }
}
function toVNode(xel, inSvgNS) {
    if (typeof xel === 'string') {
        return { isSvg: inSvgNS, text: xel, type: 1 };
    }
    else if (xel.hasOwnProperty('tag')) {
        const isSvg = inSvgNS || xel.tag === 'svg';
        let vnode = { children: [], isSvg, type: 0, vElement: xel };
        const length = xel.children.length;
        for (let i = 0; i < length; i++) {
            vnode.children[i] = toVNode(xel.children[i], isSvg);
        }
        return vnode;
    }
    else if (xel instanceof Component) {
        return { instance: xel, isSvg: inSvgNS, type: 2 };
    }
    else {
        return { baseRender: xel, isSvg: inSvgNS, type: 3 };
    }
}

function update(vnode) {
    let core = vnode.baseRender;
    function baseRender() {
        let result;
        vnode.reaction.track(() => { result = core(); });
        return result;
    }
    vnode.baseRender = baseRender;
    return function () {
        const next = toVNode(vnode.baseRender(), vnode.isSvg);
        const prev = vnode.vnode;
        if (prev.type === 1 && next.type === 1) {
            updateText(prev, next, vnode);
        }
        else if (prev.type === 1) {
            simpleReplaceUpdate(prev, next, vnode);
        }
        else {
            unMount(prev);
            simpleReplaceUpdate(prev, next, vnode);
        }
    };
}
function updateText(prev, next, dynamic) {
    const dom = prev.dom;
    const text = next.text;
    next.dom = prev.dom;
    dynamic.vnode = next;
    if (text !== prev.text) {
        dom.nodeValue = text;
    }
}
function simpleReplaceUpdate(prev, next, dynamic) {
    let prevDom = prev.type === 2 ? prev.vnode.dom : prev.dom;
    prevDom.parentNode.replaceChild(vNodeToDom(next), prevDom);
    dynamic.vnode = next;
}
function unMount(vnode) {
    switch (vnode.type) {
        case 0: unMountEl(vnode);
        case 1: return;
        case 2:
            unMount(vnode.vnode);
            vnode.instance.onUnMount && vnode.instance.onUnMount();
            break;
        case 3: unMount(vnode.vnode);
    }
}
function unMountEl(vnode) {
    if (vnode.propReactions) {
        const propKeys = Object.keys(vnode.propReactions);
        for (let i = 0; i < propKeys.length; i++) {
            vnode.propReactions[propKeys[i]].dispose();
        }
    }
    if (vnode.styleReactions) {
        const styleKeys = Object.keys(vnode.styleReactions);
        for (let i = 0; i < styleKeys.length; i++) {
            vnode.styleReactions[styleKeys[i]].dispose();
        }
    }
    for (let i = 0; i < vnode.children.length; i++) {
        unMount(vnode.children[i]);
    }
}

function createElement(tag, isSvg) {
    let dom;
    if (isSvg) {
        dom = document.createElementNS('http://www.w3.org/2000/svg', tag);
    }
    else {
        dom = document.createElement(tag);
    }
    return dom;
}
function vNodeToDom(vnode) {
    switch (vnode.type) {
        case 0: return mountElementNode(vnode);
        case 1: return vnode.dom = document.createTextNode(vnode.text);
        case 2: return mountComponentVNode(vnode);
        case 3: return mountDynamicVNode(vnode);
    }
}
function mountDynamicVNode(vnode) {
    vnode.reaction = new Reaction(update(vnode));
    let newVel;
    vnode.reaction.track(function () { newVel = vnode.baseRender(); });
    const newVNode = toVNode(newVel, vnode.isSvg);
    vnode.vnode = newVNode;
    let dom = vNodeToDom(newVNode);
    newVNode.dom = dom;
    return dom;
}
function mountComponentVNode(vnode) {
    const xel = vnode.instance.render(vnode.instance.props);
    const renderVNode = toVNode(xel, vnode.isSvg);
    vnode.vnode = renderVNode;
    const dom = vNodeToDom(renderVNode);
    vnode.instance.onMount && vnode.instance.onMount();
    return dom;
}
function mountElementNode(vnode) {
    let dom = createElement(vnode.vElement.tag, vnode.isSvg);
    vnode.dom = dom;
    setProps(vnode);
    appendVNodeChildren(vnode);
    return dom;
}
function appendVNodeChildren(vnode) {
    for (let i = 0; i < vnode.children.length; i++) {
        vnode.dom.appendChild(vNodeToDom(vnode.children[i]));
    }
}
function render(xel, dom) {
    dom.appendChild(vNodeToDom(toVNode(xel, false)));
}

function h(tag, props, children) {
    if (Array.isArray(props)) {
        children = props;
        props = {};
    }
    else if (!Array.isArray(children)) {
        children = [];
    }
    return { tag, props, children };
}
const tags = new Proxy({}, {
    get(target, prop) {
        return h.bind(null, prop);
    }
});

function matches(urlSegments, pathSegments) {
    if (urlSegments.length !== pathSegments.length) {
        return false;
    }
    for (let i = 0; i < urlSegments.length; i++) {
        if (pathSegments[i][0] === ':') {
            continue;
        }
        if (pathSegments[i] !== urlSegments[i]) {
            return false;
        }
    }
    return true;
}
class Router {
    constructor() {
        this.back = history.back.bind(history);
        this.forward = history.forward.bind(history);
        this.go = history.go.bind(history);
        this.url = window.location.pathname;
        this.push = (title, testing) => {
            this.setUrl(title);
            if (!testing) {
                window.history.pushState({}, '', title);
            }
        };
    }
    get urlSegments() {
        let url = this.url;
        if (url[0] === '/') {
            url = url.substring(1);
        }
        if (url.indexOf('?') > -1) {
            url = url.substring(0, url.indexOf('?'));
        }
        return url.split('/');
    }
    get queries() {
        if (this.url.indexOf('?') === -1) {
            return {};
        }
        let queries = {};
        let pairs = this.url.substring(this.url.indexOf('?') + 1).split('&');
        for (let i = 0; i < pairs.length; i++) {
            let [key, value] = pairs[i].split('=');
            if (typeof key === 'string') {
                queries[key] = value;
            }
        }
        return queries;
    }
    getParams(path) {
        path = path[0] === '/' ? path.substring(1) : path;
        const pathSegments = path.split('/');
        if (!matches(this.urlSegments, pathSegments)) {
            return {};
        }
        let params = {};
        for (let i = 0; i < pathSegments.length; i++) {
            if (pathSegments[i][0] === ':') {
                params[pathSegments[i].substring(1)] = this.urlSegments[i];
            }
        }
        return params;
    }
    setUrl(url) {
        this.url = url;
    }
}
__decorate([
    state
], Router.prototype, "url", void 0);
__decorate([
    action
], Router.prototype, "setUrl", null);
const router = new Router();
window.onpopstate = () => { router.setUrl(window.location.pathname); };

let { input: input$1, div: div$1, button: button$1, h6 } = tags;
function prettyHours(hrs) {
    const base = Math.trunc(hrs / 60);
    if (base === 0) {
        return '12';
    }
    return base.toString();
}
function prettyMins(mins) {
    return (mins % 60).toString();
}
class TimeEditor extends Component {
    render({ time, label }) {
        const wrapperProps = {
            style: {
                fontSize: '4em',
                background: '#BF360C',
                padding: '.2em',
                margin: '.1em',
                borderRadius: '.2em',
                display: 'flex',
                flexFlow: 'column',
                alignItems: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)'
            }
        };
        const smallerWrapper = {
            style: {
                display: 'flex',
                flexFlow: 'row',
                justifyContent: 'center',
            }
        };
        const hrsProps = {
            max: 12,
            min: 0,
            oninput: this.changeHrs,
            style: { width: '100px', fontSize: '1em' },
            type: 'number',
            value: () => prettyHours(time.hrs)
        };
        const minsProps = {
            max: 60,
            min: 0,
            oninput: this.changeMins,
            style: { width: '100px', fontSize: '1em' },
            type: 'number',
            value: () => prettyMins(time.mins)
        };
        const amPmProps = {
            style: { width: '100px', fontSize: '.8em' },
            onclick: this.changeAmPm
        };
        return div$1(wrapperProps, [
            h6({ style: { margin: '0' } }, [label]),
            div$1(smallerWrapper, [
                input$1(hrsProps),
                ':',
                input$1(minsProps),
                button$1(amPmProps, [() => time.am ? 'AM' : 'PM'])
            ])
        ]);
    }
    changeHrs(e) {
        const parsed = parseInt(e.target.value, 10);
        let { time } = this.props;
        if (parsed > 12 || parsed < 0) {
            e.target.value = prettyHours(time.hrs);
        }
        else if (parsed === 13) {
            time.hrs = 1;
        }
        else if (!isNaN(parsed)) {
            time.hrs = parsed;
        }
    }
    changeMins(e) {
        const parsed = parseInt(e.target.value, 10);
        let { time } = this.props;
        if (parsed > 60 || parsed < 0) {
            e.target.value = prettyMins(time.mins);
        }
        else {
            time.mins = parsed;
        }
    }
    changeAmPm() {
        this.props.time.am = !this.props.time.am;
    }
}
__decorate([
    action
], TimeEditor.prototype, "changeHrs", null);
__decorate([
    action
], TimeEditor.prototype, "changeMins", null);
__decorate([
    action
], TimeEditor.prototype, "changeAmPm", null);

let { h1, div, nav, button, input, span, ul, li } = tags;
function getDiff(a, b) {
    const valA = a.mins + (a.am ? 0 : 720) + a.hrs * 60;
    const valB = b.mins + (b.am ? 0 : 720) + b.hrs * 60;
    return valA > valB ? valA - valB : 0;
}
function round(num) {
    return Math.round(num * 100) / 100;
}
class Break {
    constructor() {
        this.start = { am: true, mins: 0, hrs: 0 };
        this.end = { am: true, mins: 0, hrs: 0 };
    }
    get duration() {
        return getDiff(this.end, this.start);
    }
}
__decorate([
    state
], Break.prototype, "start", void 0);
__decorate([
    state
], Break.prototype, "end", void 0);
class Session {
    constructor() {
        this.breaks = [];
        this.start = { am: true, mins: 0, hrs: 0 };
        this.end = { am: true, mins: 0, hrs: 0 };
        this.baseTA = 0;
        this.bodyMotion = [];
    }
    get totalTA() {
        return this.baseTA - this.bodyMotion.reduce((acc, v) => acc + v, 0);
    }
    get totalBreaks() {
        return this.breaks.reduce((acc, v) => acc + v.duration, 0);
    }
    get totalTime() {
        return getDiff(this.end, this.start) - this.totalBreaks;
    }
    get prettyTotal() {
        const hrs = Math.trunc(this.totalTime / 60).toString();
        const mins = (this.totalTime % 60).toString();
        return `${hrs.length === 1 ? '0' + hrs : hrs}:${mins.length === 1 ? '0' + mins : mins}`;
    }
    get perHour() {
        if (this.totalTime === 0 || this.totalTA === 0) {
            return 0;
        }
        return round((this.totalTA / this.totalTime) * 60);
    }
    addBreak() {
        this.breaks.push(new Break());
    }
    changeTa(e) {
        this.baseTA = parseFloat(e.target.value);
    }
    addBodyMotion() {
        this.bodyMotion.push(0);
    }
    updateBodyMotion(index, val) {
        this.bodyMotion[index] = val;
    }
}
__decorate([
    state
], Session.prototype, "breaks", void 0);
__decorate([
    state
], Session.prototype, "start", void 0);
__decorate([
    state
], Session.prototype, "end", void 0);
__decorate([
    state
], Session.prototype, "baseTA", void 0);
__decorate([
    state
], Session.prototype, "bodyMotion", void 0);
__decorate([
    action
], Session.prototype, "addBreak", null);
__decorate([
    action
], Session.prototype, "changeTa", null);
__decorate([
    action
], Session.prototype, "addBodyMotion", null);
__decorate([
    action
], Session.prototype, "updateBodyMotion", null);
const sessionStore = new Session();
const breakItem = (breakStore) => div({}, [
    new TimeEditor({ time: breakStore.start, label: 'break start', width: '80%' }),
    new TimeEditor({ time: breakStore.end, label: 'break end', width: '80%' })
]);
const breaks = () => div({
    style: {
        background: '#37474F',
        marginTop: '.2em',
        padding: '.4em',
        borderRadius: '.2em',
        display: 'flex',
        flexFlow: 'column',
        alignItems: 'center',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)'
    }
}, [
    button({
        onclick: sessionStore.addBreak,
        style: { fontSize: '3em', }
    }, ['Add a break']),
    ...sessionStore.breaks.map(breakItem)
]);
const session = div({ style: { width: '40%' } }, [
    new TimeEditor({ time: sessionStore.start, label: 'start' }),
    breaks,
    new TimeEditor({ time: sessionStore.end, label: 'end' })
]);
const total = div({
    style: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
        fontSize: '4em',
        background: '#37474F',
        marginTop: '.2em',
        padding: '.3em',
        borderRadius: '.2em'
    }
}, [
    'Time: ',
        () => sessionStore.prettyTotal,
    ' TA: ',
        () => round(sessionStore.totalTA).toString(),
    ' per hr: ',
        () => sessionStore.perHour.toString()
]);
class BodyMotion extends Component {
    onMount() {
        if (this.props['last']) {
            setTimeout(() => {
                document.getElementById('body-motion-' + this.props['index']).focus();
            }, 10);
        }
    }
    render({ index }) {
        function getBM(bm) {
            return bm === '0' ? '' : bm;
        }
        return div({}, [
            input({
                style: { fontSize: '.7em', width: '50%', margin: '.2em' },
                value: () => getBM(sessionStore.bodyMotion[index].toString()),
                onkeypress: this.onkeypress,
                step: '.01',
                id: 'body-motion-' + index
            })
        ]);
    }
    onkeypress(e) {
        const charCode = (e.which) ? e.which : e.keyCode;
        if (charCode === 13) {
            sessionStore.addBodyMotion();
            if (!isNaN(parseFloat(e.target.value))) {
                sessionStore.updateBodyMotion(this.props['index'], parseFloat(e.target.value));
            }
            return;
        }
        if (charCode == 46 && e.srcElement.value.split('.').length > 1) {
            return false;
        }
        if (charCode != 46 && charCode > 31 && (charCode < 48 || charCode > 57)) {
            return false;
        }
        return true;
    }
}
__decorate([
    action
], BodyMotion.prototype, "onkeypress", null);
const ta = div({
    style: {
        width: '40%',
        background: '#BF360C',
        fontSize: '4em',
        padding: '.4em',
        borderRadius: '.2em',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)'
    }
}, [
    'Total TA:',
    input({
        value: () => sessionStore.baseTA.toString(),
        style: { width: '80%', fontSize: '1em' },
        oninput: sessionStore.changeTa,
        type: 'number'
    }),
    button({
        style: {
            fontSize: '.5em',
            marginTop: '.3em'
        },
        onclick: sessionStore.addBodyMotion
    }, ['Add body motion']),
        () => div({}, sessionStore.bodyMotion.map((_, index) => new BodyMotion({ index, last: index === sessionStore.bodyMotion.length - 1 })))
]);
const main = div({}, [
    div({
        style: {
            display: 'flex',
            flexFlow: 'row',
            justifyContent: 'space-between'
        }
    }, [
        session,
        ta
    ]),
    total
]);
render(main, document.getElementById('root'));
