/**
 * <scroll-bar> — custom scrollbar Web Component
 * © Andrey Sudarchikov — https://github.com/AndreySudarchikov
 */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const STYLES = `
    :host { 
        display: block;
        box-sizing: border-box;
        --track-color: rgba(0,0,0,0.1);
        --thumb-color: rgba(0,0,0,0.4);
        --track-width: 4px;
        --track-radius: 2px;
        --thumb-width: 8px;
        --thumb-radius: 4px;
        --thumb-minsize: 50;
        --thumb-opacity: 1;
        --transition-duration: 0.5s;
    }

    div[stage] {
        position: absolute;
        box-sizing: border-box;
        right: 0; top: 0; width: 100%; height: 100%; 
        cursor: pointer;
        opacity: 0;
        z-index: inherit;
        transition: opacity var(--transition-duration);
        pointer-events: none;
    }

    div[track] {
        position: absolute;
        left: 50%; top: 50%; transform: translate(-50%,-50%);
        background-color: var(--track-color);
        border-radius: var(--track-radius);
    }

    :host(:not([horizontal])) div[track] { width: var(--track-width); height: 100%; }
    :host([horizontal]) div[track] { width: 100%; height: var(--track-width); }

    div[thumb-stage] {
        position: absolute;
        left: 0; top: 0; width: 100%; height: 100%;
        pointer-events: auto;
        touch-action: none;
        will-change: transform;
    }

    div[thumb] {
        position: absolute;
        transform-origin: center;
        left: 50%; top: 50%; width: 100%; height: 100%; transform: translate(-50%,-50%);
        background-color: var(--thumb-color);
        border-radius: var(--thumb-radius);
        opacity: var(--thumb-opacity);
    }

    :host(:not([horizontal])) div[thumb] { width: var(--thumb-width); }
    :host([horizontal]) div[thumb] { height: var(--thumb-width); }

    div[stage].visible {
        opacity: 1;
        pointer-events: auto;
        transition-duration: calc(var(--transition-duration) / 2)
    }

    :host([autohide]) div[stage] {
        pointer-events: auto;
    }
`;

const TEMPLATE = `
    <div stage>
        <div track part="track"></div>
        <div thumb-stage>
            <div thumb part="thumb"></div>
        </div>
    </div>
`;

class ScrollBarElement extends HTMLElement {
    #ro = null;
    #mo = null;
    #hostMo = null;
    #raf = null;
    #cached = {
        needsUpdate: true,
        needsCssUpdate: true,
        vert: true, // is scrollbar vertical
        scroller: { ss: 0, cs: 0, max: 0 }, // ss - scrollSize, cs - clientSize, max = ss - cs
        thumb: { min: 0, cs: 0, t: 0 }, // min - thumb-min size, cs - clientSize, t - transform position x or y px
        stage: { cs: 0, max: 0, rect: 0 }, // cs - clientSize, max = cs - thumb.cs, rect - getBoundingClientRect
    };

    #hideTimer = null;
    #state = {
        progress: 0, // scroll progress 0-1 (0-100%)
        drag: { active: false, pp: 0, sp: 0 }, // on drag start set true, pp - pointer start position, sp - scroll progress start value
        hover: { scroller: false, stage: false, thumb: false },
        autohide: { enabled: false, mode: 'all', delay: 1000 },
        visible: false
    };

    static get observedAttributes() {
        return ['horizontal', 'scroller', 'autohide', 'autohide-mode'];
    }

    constructor() {
        super();

        this._shadowRoot = this.attachShadow({ mode: "closed" });

        const styleSheet = document.createElement('style');
        styleSheet.textContent = STYLES;

        const container = document.createElement('div');
        container.innerHTML = TEMPLATE;

        this._shadowRoot.append(styleSheet, container.firstElementChild);

        this.isLive = true;
        this.stage = this._shadowRoot.querySelector('div[stage]');
        this.thumbStage = this._shadowRoot.querySelector('div[thumb-stage]');

        this.#initObservers();

        this.#hostMo = new MutationObserver(() => {
            this.#cached.needsCssUpdate = true;
            this.requestRender(true);
        });
    }

    connectedCallback() {
        this.#updateAttributeCache();

        if (this.hasAttribute('scroller')) {
            this.setScroller(this.getAttribute('scroller'));
        } else {
            this.setScroller(this.resolveScroller());
        }

        this.stage.addEventListener('pointerdown', this.#onPointerDown);
        this.stage.addEventListener('pointerenter', this.#onStageEnter);
        this.stage.addEventListener('pointerleave', this.#onStageLeave);

        this.#hostMo.observe(this, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    disconnectedCallback() {
        this.#cleanupObservers();
        this.#hostMo.disconnect();

        this.stage.removeEventListener('pointerdown', this.#onPointerDown);
        this.stage.removeEventListener('pointerenter', this.#onStageEnter);
        this.stage.removeEventListener('pointerleave', this.#onStageLeave);

        this.#endDrag(true);
        this.isLive = false;
        this.#clearHideTimer();
        if (this.#raf) cancelAnimationFrame(this.#raf);
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal) return;

        if (name === 'horizontal') {
            this.requestRender(true);
        } else if (name === 'scroller' && this.isLive) {
            this.setScroller(newVal);
        } else if (name === 'autohide' || name === 'autohide-mode') {
            this.#updateAttributeCache();
            this.requestRender(true);
        }
    }

    
    // Public methods

    setScroller(elem) {
        this.#cleanupObservers();

        let target = (typeof elem === 'string') ? document.querySelector(elem) : elem;
        this.scroller = this.#checkDoc(target);

        if (!this.scroller) return;

        this.requestRender(true);
        this.#setupObservers();
    }

    scrollTo = (progress, behavior = 'auto') => {
        if (!this.scroller) return;
        const key = this.#cached.vert ? "top" : "left";
        this.scroller.scrollTo({ [key]: this.#cached.scroller.max * progress, behavior });
    }

    resolveScroller() {
        let parent = this.parentElement;
        while (parent) {
            if (parent.hasAttribute('data-scrollbar-scroller')) return this.#checkDoc(parent);
            let child = parent.querySelector(':scope > [data-scrollbar-scroller]');
            if (child) return this.#checkDoc(child);
            parent = parent.parentElement;
        }
        return null;
    }

    requestRender = (updateCache = false, scrolling = false) => {
        if (this.#raf || !this.isLive) return;
        this.#state.scrolling = scrolling;
        this.#cached.needsUpdate = updateCache;

        this.#raf = requestAnimationFrame(() => {
            this.#updateCache();
            this.#render();
            this.#raf = null;
        });
    }


    // Private events

    #onScrollerEnter = () => {
        this.#state.hover.scroller = true;
        this.requestRender();
    }

    #onScrollerLeave = () => {
        this.#state.hover.scroller = false;
        this.requestRender();
    }

    #onStageEnter = () => {
        this.#state.hover.stage = true;
        this.requestRender();
    }

    #onStageLeave = () => {
        this.#state.hover.stage = false;
        this.requestRender();
    }

    #onPointerDown = (e) => {
        if (e.button !== 0) return;

        e.stopPropagation();
        e.preventDefault();

        const eventPath = e.composedPath();

        this.stage.setPointerCapture(e.pointerId);

        this.#state.drag = {
            active: true,
            pid: e.pointerId,
            pp: this.#cached.vert ? e.clientY : e.clientX,
            sp: this.#state.progress
        }

        if (!eventPath.includes(this.thumbStage)) {
            const offset = this.#cached.vert ? (e.clientY - this.#cached.stage.rect.top) : (e.clientX - this.#cached.stage.rect.left);
            const progress = clamp((offset - this.#cached.thumb.cs / 2) / (this.#cached.stage.max || 1), 0, 1);
            this.#state.drag.sp = progress;
            this.scrollTo(progress, 'smooth');
        }

        this.stage.addEventListener('pointermove', this.#onPointerMove);
        this.stage.addEventListener('pointerup', this.#onPointerUp);
        this.stage.addEventListener('pointercancel', this.#onPointerUp);
    }

    #onPointerMove = (e) => {
        const delta = (this.#cached.vert ? e.clientY : e.clientX) - this.#state.drag.pp;
        const progress = clamp(this.#state.drag.sp + delta / (this.#cached.stage.max || 1), 0, 1);
        this.scrollTo(progress);
    }

    #onPointerUp = e => {
        if (e.pointerId !== this.#state.drag.pid) return;
        this.#endDrag();
    };

    #endDrag = (force = false) => {
        if (!this.#state.drag.active && !force) return;

        try { if (this.#state.drag.pid !== undefined) this.stage.releasePointerCapture(this.#state.drag.pid); }
        catch (_) { }

        this.stage.removeEventListener('pointermove', this.#onPointerMove);
        this.stage.removeEventListener('pointerup', this.#onPointerUp);
        this.stage.removeEventListener('pointercancel', this.#onPointerUp);

        this.#state.drag.active = false;
        this.requestRender();
    };

    #onScroll = () => {
        this.requestRender(false,true);
    }


    // Private Logic 

    #hide() {
        if (this.#state.drag.active || this.#state.hover.stage) return;
        if(this.#state.autohide.enabled) {
            this.#clearHideTimer();
            this.#hideTimer = setTimeout(() => {
                if (!this.#state.drag.active && !this.#state.hover.stage) this.stage.classList.remove('visible');
            }, this.#state.autohide.delay);
        } else this.stage.classList.remove('visible');
    }

    #clearHideTimer() {
        if (!this.#hideTimer) return;
        clearTimeout(this.#hideTimer);
        this.#hideTimer = null;
    }

    #initObservers() {
        this.#ro = new ResizeObserver(() => { this.requestRender(true,true); });
        this.#mo = new MutationObserver((mutations) => {
            let needsUpdate = false;
            for (const m of mutations) {
                const nodes = [...m.addedNodes, ...m.removedNodes];
                if (nodes.some(node => node === this)) continue;
                if (m.addedNodes.length || m.removedNodes.length) {
                    needsUpdate = true;
                    this.#observeChildren(m.addedNodes);
                    m.removedNodes.forEach(node => {
                        if (node instanceof HTMLElement) this.#ro.unobserve(node);
                    });
                }
            }
            if (needsUpdate) { this.requestRender(true,true); }
        });
    }

    #setupObservers() {
        if (!this.scroller) return;

        const scrollTarget = (this.scroller === document.scrollingElement) ? document : this.scroller;
        scrollTarget.addEventListener('scroll', this.#onScroll, { passive: true });

        this.scroller.addEventListener('pointerenter', this.#onScrollerEnter);
        this.scroller.addEventListener('pointerleave', this.#onScrollerLeave);

        this.#ro.observe(this.scroller);
        this.#observeChildren(this.scroller.children);
        this.#mo.observe(this.scroller, { childList: true, subtree: false });
    }

    #cleanupObservers() {
        if (!this.scroller) return;

        const scrollTarget = (this.scroller === document.scrollingElement) ? document : this.scroller;
        scrollTarget.removeEventListener('scroll', this.#onScroll);

        this.scroller.removeEventListener('pointerenter', this.#onScrollerEnter);
        this.scroller.removeEventListener('pointerleave', this.#onScrollerLeave);

        this.#ro.disconnect();
        this.#mo.disconnect();
    }

    #observeChildren(nodes) {
        for (const node of nodes) {
            if (node instanceof HTMLElement) this.#ro.observe(node);
        }
    }

    #updateAttributeCache() {
        this.#state.autohide.enabled = this.hasAttribute('autohide');
        this.#state.autohide.mode = this.getAttribute('autohide-mode') || 'all';
        this.#state.autohide.delay = parseInt(this.getAttribute('autohide')) || 1000;
    }

    #updateCache() {
        if (!this.scroller || !this.isLive || !this.#cached.needsUpdate) return;
        const c = this.#cached;

        let vert = this.#cached.vert = !this.hasAttribute('horizontal');

        c.scroller.ss = vert ? Math.ceil(this.scroller.scrollHeight || 0) : Math.ceil(this.scroller.scrollWidth || 0);
        c.scroller.cs = vert ? this.scroller.clientHeight : this.scroller.clientWidth;
        c.scroller.max = c.scroller.ss - c.scroller.cs;
        c.scrollable = c.scroller.ss > c.scroller.cs;

        c.stage.cs = vert ? this.stage.clientHeight || 0 : this.stage.clientWidth || 0;
        c.stage.rect = this.stage.getBoundingClientRect();
        
        if (c.needsCssUpdate) {
            const styles = getComputedStyle(this);
            c.thumb.min = parseInt(styles.getPropertyValue('--thumb-minsize')) || 50;            
            c.needsCssUpdate = false;
        }
        let tSize = c.scroller.ss > c.scroller.cs ? Math.max(c.stage.cs * c.scroller.cs / c.scroller.ss, Math.min(c.thumb.min, c.stage.cs * 0.8)) : 0;
        tSize = clamp(tSize,10,c.stage.cs);
        
        c.thumb.cs = parseFloat(tSize.toFixed(2));
        c.stage.max = Math.max(0, c.stage.cs - c.thumb.cs) ;       

        this.#cached.needsUpdate = false;
    }

    #checkDoc = el => {
        if (!el || el !== document.body) return el;

        const bodyStyle = window.getComputedStyle(document.body);

        if (bodyStyle.overflowY === 'auto' || bodyStyle.overflowY === 'scroll' || bodyStyle.overflowX === 'auto' || bodyStyle.overflowX === 'scroll') {
            if (document.body.scrollHeight > window.innerHeight) return document.body;
        }

        return document.scrollingElement || document.documentElement;
    };

    #updateVisibilty() {
        const c = this.#cached;
        const s = this.#state;
        s.visible = false;
        let mode = s.autohide.mode;
        
        if(s.autohide.enabled) {
            if( 
                (s.hover.stage) || (s.drag.active) || 
                (s.scrolling && (mode == 'all' || mode == 'scroll')) || 
                (s.hover.scroller && (mode == 'all' || mode == 'hover'))  
            ) s.visible = true;
        } else s.visible = true;

        if(c.scrollable) {
            this.#clearHideTimer();
            if(s.visible) this.stage.classList.add('visible');    
            if(!s.visible || (
                s.autohide.enabled && (
                    (s.scrolling && mode == 'scroll') || 
                    (!s.hover.scroller && mode == 'all')
                )
            )) this.#hide();
        } else this.stage.classList.remove('visible');   
    }

    #render() {
        if (!this.scroller || !this.isLive) return;
        const c = this.#cached;

        if(c.scrollable) {
            const vert = c.vert;
            let sc = vert ? this.scroller.scrollTop : this.scroller.scrollLeft;
    
            let cp = c.scroller.max > 0 ? (sc / c.scroller.max) : 0;
            cp = this.#state.progress = cp > 0.999 ? 1 : cp;
    
            const p = parseFloat((cp * c.stage.max).toFixed(2));
    
            if (c.thumb.cs !== c.thumb.lastCs) {
                c.thumb.lastCs = c.thumb.cs;
                this.thumbStage.style[vert ? 'height' : 'width'] = c.thumb.cs + 'px';
                this.thumbStage.style[vert ? 'width' : 'height'] = '';
            }
    
            this.thumbStage.style.transform = vert ? `translate3d(0, ${p}px, 0)` : `translate3d(${p}px, 0, 0)`;
        } 

        this.#updateVisibilty();
        this.#state.scrolling = false;
    }

}

customElements.define('scroll-bar', ScrollBarElement);

// factory function
function ScrollBar(scroller, horizontal = false) {
    const elem = document.createElement('scroll-bar');
    if (scroller) elem.setScroller(scroller);
    if (horizontal) elem.setAttribute('horizontal', '');
    return elem;
}

export { ScrollBar };
