// <scroll-bar> — custom scrollbar Web Component
// © Andrey Sudarchikov — https://github.com/AndreySudarchikov
 
const css = document.createElement('style');
css.textContent = `
    :host { 
        display: block;
        box-sizing: border-box;

        --track-color: rgba(0,0,0,0.3);
        --thumb-color: rgba(255,255,255,1);
        
        --track-width: 4px;
        --track-radius: 2px;
        
        --thumb-width: 8px;
        --thumb-radius: 4px;
        
        --thumb-minsize: 50;
        --thumb-opacity: 1;
        --thumb-hover-opacity: 1;
        --thumb-hover-scale: 2;

        --transition-duration: 0.3s;
    }


    /* @media (pointer: fine) { }*/
        
    div[stage] {
        position: absolute;
        box-sizing: border-box;
        right: 0px; top: 0px; width: 100%; height: 100%; 
        cursor: pointer;
        opacity: 0;
        z-index: inherit;
        transition: opacity var(--transition-duration);
    }

    div[track] {
        position: absolute;
        left: 50%; top: 50%; transform: translate(-50%,-50%);
        background-color: var(--track-color);
        border-radius: var(--track-radius);
    }

    :host(:not([data-horizontal])) div[track] { width: var(--track-width); height: 100%; }

    :host([data-horizontal]) div[track] { width: 100%; height: var(--track-width); }

    div[thumb-stage] {
        position: absolute;
        left: 0; top: 0; width: 100%; height: 100%;
        pointer-events: inherit;
        will-change: transform;
    }

    :host(:not([data-horizontal])) div[thumb-stage] { width: 100%; }
    :host([data-horizontal]) div[thumb-stage] { height: 100%; }

    div[thumb] {
        position: absolute;
        transform-origin: center;
        left: 50%; top: 50%; width: 100%; height: 100%; transform: translate(-50%,-50%);
        background-color: var(--thumb-color);
        border-radius: var(--thumb-radius);
        opacity: var(--thumb-opacity);
    }

    :host(:not([data-horizontal])) div[thumb] { width: var(--thumb-width); }
    :host([data-horizontal]) div[thumb] { height: var(--thumb-width); }

    :host(:not([data-autohide])) div[stage].visible,
    :host([data-autohide]:hover) div[stage].visible {
        opacity: 1; pointer-events: inherit;
    }
`

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

class ScrollBarElement extends HTMLElement  {

    #ro = null;
    #mo = null;
    #raf = null;
    #vert = false;
    #cached = { sh: 0, ch: 0, sw: 0, cw: 0, max: 0, smax: 0 };
    #pointerDown = {};
    
    constructor(params) {
        super(params);
        
        this._shadowRoot = this.attachShadow({ mode: "closed" });
        let temp = document.createElement('template');
        temp.innerHTML = `
            <div stage>
                <div track part="track"></div>
                    
                <div thumb-stage>
                    <div thumb part="thumb"></div>
                </div>
            </div>
        `;
        this._shadowRoot.append(
            css.cloneNode(true),
            temp.content.cloneNode(true)
        );

        this.isLive = true;
        this.to = null;
        this.stage = this._shadowRoot.querySelector('div[stage]');
        this.thumbStage = this._shadowRoot.querySelector('div[thumb-stage]');
        
        this.#ro = new ResizeObserver(entries => {
            this.#updateCache();
        });

        this.#mo = new MutationObserver(mutations => {
            for (const m of mutations) {
                this.#observeChildren(m.addedNodes);
                m.removedNodes.forEach(node => {
                    if (node instanceof HTMLElement) this.#ro.unobserve(node);
                });
            }
            this.#updateCache();
        });
    }

    
    connectedCallback() {  
        this.thumbMinSize = parseInt(getComputedStyle(this).getPropertyValue('--thumb-minsize')) || 50;

        if(this.dataset.scroller) this.setScroller(this.dataset.scroller);
        else this.setScroller(this.resolveScroller());
        
        this.stage.addEventListener('pointerdown',this.#onPointerDown);
    }

    disconnectedCallback() { 
        this.#cleanupObservers();
        this.isLive = false; 
    }

    #cleanupObservers() {
        document.removeEventListener('scroll', this.requestRender,{ passive: true });
        window.removeEventListener('resize', this.#onWindowResize);
        this.scroller?.removeEventListener('scroll', this.requestRender,{ passive: true });
        if (this.#ro) this.#ro.disconnect();
        if (this.#mo) this.#mo.disconnect();
    }

    #setupObservers() {
        const isDoc = this.scroller === document.documentElement || this.scroller === document.body;
        if(isDoc) {
            document.addEventListener('scroll', this.requestRender,{ passive: true });
            window.addEventListener('resize', this.#onWindowResize);
        } else this.scroller.addEventListener('scroll', this.requestRender,{ passive: true });

        this.#ro.observe(this.scroller);
        this.#observeChildren(this.scroller.children);
        this.#mo.observe(this.scroller, { childList: true });
    }

    #onWindowResize = () => {
        this.#updateCache();
    }

    #observeChildren(nodes) {
        for (const node of nodes) {
            if (node instanceof HTMLElement) {
                this.#ro.observe(node);
            }
        }
    }

    #updateCache() {
        const isDoc = this.scroller === document.documentElement || this.scroller === document.body;
        this.#cached.sh = this.scroller.scrollHeight || 1;
        this.#cached.sw = this.scroller.scrollWidth || 1;   
        this.#cached.ch = isDoc ? window.innerHeight : this.scroller.clientHeight;
        this.#cached.cw = isDoc ? window.innerWidth : this.scroller.clientWidth;
        
        this.#cached.sch = this.stage.clientHeight || 1;
        this.#cached.scw = this.stage.clientWidth || 1;       
        this.#cached.tch = Math.max(this.#cached.sch * this.#cached.ch / this.#cached.sh, Math.min(this.thumbMinSize,this.#cached.sch * 0.8));
        this.#cached.tcw = Math.max(this.#cached.scw * this.#cached.cw / this.#cached.sw, Math.min(this.thumbMinSize,this.#cached.scw * 0.8));
        this.#vert = !this.hasAttribute('data-horizontal');      
        this.#cached.max = this.#vert ? this.#cached.sh - this.#cached.ch : this.#cached.sw - this.#cached.cw;
        this.#cached.smax = Math.max(1,this.#vert ? this.#cached.sch - this.#cached.tch : this.#cached.scw - this.#cached.tcw);
        this.requestRender(); 
    }

    #onPointerDown = e => {
        e.stopPropagation(); e.preventDefault(); 
        const eventPath = e.composedPath(); 
        const rect = this.stage.getBoundingClientRect();
        this.#pointerDown.y = e.clientY;
        this.#pointerDown.x = e.clientX;
        this.#pointerDown.sp = this.#cached.sp;
        let down = this.#pointerDown;

        if(!eventPath.includes(this.thumbStage)) {
            if(this.#vert) down.sp = clamp((e.clientY - rect.top - this.#cached.tch/2) / this.#cached.smax, 0, 1);
            else down.sp = clamp((e.clientX - rect.left - this.#cached.tcw/2) / this.#cached.smax, 0, 1);
            this.scrollTo(down.sp,'smooth');
        }
        
        document.addEventListener('pointerup',e=>{ document.removeEventListener('pointermove',this.#onPointerMove); },{ once: true });
        document.addEventListener('pointermove',this.#onPointerMove);
    }

    #onPointerMove = e => {
        let down = this.#pointerDown;
        this.scrollTo(down.sp + (this.#vert ? e.clientY - down.y : e.clientX - down.x) / this.#cached.smax);
    }

    setScroller(elem) {
        this.#cleanupObservers();
        if(elem instanceof HTMLElement) this.scroller = this.#checkDoc(elem);
        else this.scroller = this.#checkDoc(document.querySelector(elem));
        if(!this.scroller) return;
        this.#updateCache();
        this.#setupObservers();
        this.requestRender();
    }
    
    scrollTo = (progress, behavior='auto') => {
        if(!this.scroller) return;
        this.scroller.scrollTo({ [this.#vert ? "top": "left"]: this.#cached.max * progress, behavior: behavior}); 
    }

    #checkDoc = el => { 
        if (el !== document.body) return el;

        const doc = document.scrollingElement || document.documentElement;
        const body = document.body;

        if (doc.scrollHeight > doc.clientHeight || doc.scrollWidth > doc.clientWidth) return doc;
        if (body.scrollHeight > body.clientHeight || body.scrollWidth > body.clientWidth) return body;

        return doc;
    };

    resolveScroller() {
        let parent = this.parentElement;
        while (parent) {
            if (parent.hasAttribute('data-scrollbar-scroller')) return this.#checkDoc(parent);
            let child = parent.querySelector(':scope > [data-scrollbar-scroller]');
            if(child) return this.#checkDoc(child);
            parent = parent.parentElement;
        }

        return null;
    }

    requestRender = () => {
        if (this.#raf) return;
        this.#raf = requestAnimationFrame(() => {
            this.#render();
            this.#raf = null;
        });
    }

    #render() {
        if(!this.scroller || !this.isLive) return;
        let vert = this.#vert; 
        console.log(this.#cached);
       
        let sch = vert ? this.#cached.sch : this.#cached.scw; 
        let tch = vert ? this.#cached.tch : this.#cached.tcw;
        let ch = vert ? this.#cached.ch : this.#cached.cw;
        let sh = vert ? this.#cached.sh : this.#cached.sw;

        this.#cached.st = vert ? this.scroller.scrollTop : this.scroller.scrollLeft;
        this.#cached.sp = this.#cached.max ? this.#cached.st / this.#cached.max : 0;

        this.thumbStage.style[vert ? 'height' : 'width'] = tch + 'px';
        
        if(sh - ch > 0 && sch > 0) {
            let pos = this.#cached.st / this.#cached.max;
            let p = pos * this.#cached.smax;
            let tx = vert ? 0: p; let ty = vert ? p : 0;
            this.thumbStage.style.transform = `translate(${tx}px, ${ty}px)`; 
            this.stage.classList.add('visible');
        } else {
            this.thumbStage.style.transform = `translate(${0}px, ${0}px)`; 
            this.stage.classList.remove('visible');
        }
    }
}

customElements.define('scroll-bar', ScrollBarElement);

function ScrollBar(scroller, horizontal=false){
    let elem = document.createElement('scroll-bar');
    if(scroller) elem.setScroller(scroller);
    elem.toggleAttribute('data-horizontal',!!horizontal);
    return elem
}

export { ScrollBar }


