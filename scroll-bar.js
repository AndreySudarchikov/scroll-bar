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
        transition: transform var(--transition-duration), background-color var(--transition-duration), opacity var(--transition-duration);
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
    }

    
    connectedCallback() {  
        const scope = this;
        
        this.thumbMinSize = parseInt(getComputedStyle(this).getPropertyValue('--thumb-minsize')) || 50;

        if(this.dataset.scroller) this.setScroller(this.dataset.scroller);
        else this.setScroller(this.resolveScroller());
        
        let prev = {}
        function updateOnSizeChange(){ 
            const scroller = scope.scroller;
            if (!scope.isLive) return;

            if(!(
                scope.scroller && 
                prev.st == scroller.scrollTop && 
                prev.sl == scroller.scrollLeft && 
                prev.sh == scroller.scrollHeight && 
                prev.sw == scroller.scrollWidth && 
                prev.ch == scroller.clientHeight && 
                prev.cw == scroller.clientWidth
            )) scope.render() 

            prev = { 
                st: scroller.scrollTop, 
                sl: scroller.scrollLeft, 
                sh: scroller.scrollHeight, 
                sw: scroller.scrollWidth,
                ch: scroller.clientHeight, 
                cw: scroller.clientWidth 
            }

            requestAnimationFrame(updateOnSizeChange);
        }
        updateOnSizeChange();

        this.stage.addEventListener('pointerdown',this.#onPointerDown);
    }

    disconnectedCallback() { this.isLive = false; }

    #onPointerDown = e => {
        e.stopPropagation(); e.preventDefault(); 
        const eventPath = e.composedPath(); 
        const rect = this.stage.getBoundingClientRect();
        this.#pointerDown.y = e.clientY;
        this.#pointerDown.x = e.clientX;
        this.#pointerDown.vp = this.ds.vp;
        this.#pointerDown.hp = this.ds.hp;
        let down = this.#pointerDown;
               
        if(!eventPath.includes(this.thumbStage)) {
            down.vp = clamp((e.clientY - rect.top - this.thumbStage.clientHeight/2) / this.ds.sbVMax, 0, 1);
            down.hp = clamp((e.clientX - rect.left - this.thumbStage.clientWidth/2) / this.ds.sbHMax, 0, 1);
            this.scrollTo(this.vert ? down.vp : down.hp,'smooth');
        }
        
        document.addEventListener('pointerup',e=>{ document.removeEventListener('pointermove',this.#onPointerMove); },{ once: true });
        document.addEventListener('pointermove',this.#onPointerMove);
    }

    #onPointerMove = e => {
        let down = this.#pointerDown;
        if(this.vert) this.scrollTo(down.vp + (e.clientY - down.y) / this.ds.sbVMax);
        else this.scrollTo(down.hp + (e.clientX - down.x) / this.ds.sbHMax);
    }

    setScroller(elem) {
        if(elem instanceof HTMLElement) this.scroller = this.#checkDoc(elem);
        else this.scroller = this.#checkDoc(document.querySelector(elem));
        this.render();
    }
    
    scrollTo = (progress, behavior='auto') => {
        if(!this.scroller) return;
        this.scroller.scrollTo({ [this.vert ? "top": "left"]: this.vert ? this.ds.vMax * progress : this.ds.hMax * progress, behavior: behavior}); 
    }

    #checkDoc = el => { return el === document.body ? document.scrollingElement : el };

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

    render() {
        if(!this.scroller || !this.isLive) return;
        let vert = this.vert = !this.hasAttribute('data-horizontal');      
       
        let ts = vert ? this.stage.clientHeight : this.stage.clientWidth;
        let ch = vert ? this.scroller.clientHeight : this.scroller.clientWidth;
        let sh = vert ? this.scroller.scrollHeight : this.scroller.scrollWidth;

        this.ds = {
            v: this.scroller.scrollTop,
            vMax: this.scroller.scrollHeight - this.scroller.clientHeight,
            sbVMax: this.stage.clientHeight - this.thumbStage.clientHeight,

            h: this.scroller.scrollLeft,
            hMax: this.scroller.scrollWidth - this.scroller.clientWidth,
            sbHMax: this.stage.clientWidth - this.thumbStage.clientWidth
        }

        this.ds.vp = this.ds.vMax? this.ds.v / this.ds.vMax : 0;
        this.ds.hp = this.ds.hMax? this.ds.h / this.ds.hMax : 0;

        this.thumbStage.style[vert ? 'height' : 'width'] = Math.max(ts * ch / sh,this.thumbMinSize) / ts * 100 + '%';
        
        if(sh - ch != 0 && ts != 0) {
            let pos = (vert ?  this.scroller.scrollTop :  this.scroller.scrollLeft) / (sh - ch);
            this.thumbStage.style[vert ? 'top' : 'left'] = pos * (ts - (vert ? this.thumbStage.clientHeight : this.thumbStage.clientWidth)) / ts * 100 + '%';
            this.stage.classList.add('visible');
        } else this.stage.classList.remove('visible');

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


