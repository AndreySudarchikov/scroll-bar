/**
 * <scroll-bar> — custom scrollbar Web Component
 * © Andrey Sudarchikov — https://github.com/AndreySudarchikov
 */

const CLAMP = (v, min, max) => Math.min(max, Math.max(min, v));

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
        --transition-duration: 0.3s;
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

    :host(:not([data-horizontal])) div[track] { width: var(--track-width); height: 100%; }
    :host([data-horizontal]) div[track] { width: 100%; height: var(--track-width); }

    div[thumb-stage] {
        position: absolute;
        left: 0; top: 0; width: 100%; height: 100%;
        pointer-events: auto;
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

    :host(:not([data-horizontal])) div[thumb] { width: var(--thumb-width); }
    :host([data-horizontal]) div[thumb] { height: var(--thumb-width); }

    div[stage].visible {
        opacity: 1;
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
    #vert = true;
    #cached = { sh: 0, ch: 0, sw: 0, cw: 0, max: 0, smax: 0, sp: 0, st: 0, tMin: 50 };
    #styleCache = null; 
    #lastRender = { p: -1, size: -1, visible: false };
    #pointerDown = {};
    #needsCacheUpdate = true;
    
    // Autohide state and cache
    #hideTimer = null;
    #state = {
        isDragging: false,
        isHoveredScroller: false,
        isHoveredStage: false,
        isVisible: false,
        autohide: false,
        autohideMode: 'all',
        autohideDelay: 500
    };

    static get observedAttributes() {
        return ['data-horizontal', 'data-scroller', 'data-autohide', 'data-autohide-mode'];
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
    }

    connectedCallback() {  
        this.#updateAttributeCache();

        if (this.dataset.scroller) {
            this.setScroller(this.dataset.scroller);
        } else {
            this.setScroller(this.resolveScroller());
        }
        
        this.stage.addEventListener('pointerdown', this.#onPointerDown);
        this.stage.addEventListener('pointerenter', this.#onStageEnter);
        this.stage.addEventListener('pointerleave', this.#onStageLeave);

        this.#hostMo = new MutationObserver(() => {
            this.#styleCache = null; 
            this.#lastRender.size = -1;
            this.requestRender(true);
        });
        this.#hostMo.observe(this, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    disconnectedCallback() { 
        this.#cleanupObservers();
        if (this.#hostMo) this.#hostMo.disconnect();

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
        
        if (name === 'data-horizontal') {
            this.#styleCache = null;
            this.#lastRender.size = -1;
            this.requestRender(true);
        } else if (name === 'data-scroller' && this.isLive) {
            this.setScroller(newVal);
        } else if (name === 'data-autohide' || name === 'data-autohide-mode') {
            this.#updateAttributeCache();
            if (this.isLive) this.#startHideTimer(); 
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
        const key = this.#vert ? "top" : "left";
        this.scroller.scrollTo({ [key]: this.#cached.max * progress, behavior }); 
    }

    show() {
        if (!this.isLive || this.#state.isVisible) return;
        this.#state.isVisible = true;
        this.stage.classList.add('visible');
        this.#startHideTimer();
    }

    hide() {
        if (this.#state.isDragging || this.#state.isHoveredStage) return;
        
        const mode = this.#state.autohideMode;
        if (this.#state.isHoveredScroller && (mode === 'hover' || mode === 'all')) return;

        this.#state.isVisible = false;
        this.stage.classList.remove('visible');
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

    requestRender = (updateCache = false) => {
        if (updateCache) this.#needsCacheUpdate = true;
        if (this.#raf || !this.isLive) return;
        
        this.#raf = requestAnimationFrame(() => {
            if (this.#needsCacheUpdate) {
                this.#updateCache();
                this.#needsCacheUpdate = false;
            }
            this.#render();
            this.#raf = null;
        });
    }

    // Private events

    #onScrollerEnter = () => {
        this.#state.isHoveredScroller = true;
        const mode = this.#state.autohideMode;
        if (this.#state.autohide && (mode === 'hover' || mode === 'all')) {
            this.show();
        }
    }

    #onScrollerLeave = () => {
        this.#state.isHoveredScroller = false;
        this.#startHideTimer();
    }

    #onStageEnter = () => {
        this.#state.isHoveredStage = true;
        this.show(); 
    }

    #onStageLeave = () => {
        this.#state.isHoveredStage = false;
        this.#startHideTimer();
    }

    #onPointerDown = (e) => {
        if (e.button !== 0) return;
        
        e.stopPropagation(); 
        e.preventDefault(); 
        
        this.#state.isDragging = true;
        this.#clearHideTimer();
        this.stage.classList.add('visible');

        const eventPath = e.composedPath(); 
        const rect = this.stage.getBoundingClientRect();

        this.stage.setPointerCapture(e.pointerId);
        
        this.#pointerDown = {
            y: e.clientY,
            x: e.clientX,
            sp: this.#cached.sp,
            pid: e.pointerId
        };

        if (!eventPath.includes(this.thumbStage)) {
            const offset = this.#vert ? (e.clientY - rect.top) : (e.clientX - rect.left);
            const thumbSize = this.#vert ? this.#cached.tch : this.#cached.tcw;
            const progress = CLAMP((offset - thumbSize / 2) / (this.#cached.smax || 1), 0, 1);
            
            this.#pointerDown.sp = progress;
            this.scrollTo(progress, 'smooth');
        }
        
        this.stage.addEventListener('pointermove', this.#onPointerMove);
        this.stage.addEventListener('pointerup', this.#onPointerUp);
        this.stage.addEventListener('pointercancel', this.#onPointerUp);
    }

    #onPointerMove = (e) => {
        const delta = this.#vert ? (e.clientY - this.#pointerDown.y) : (e.clientX - this.#pointerDown.x);
        const progress = CLAMP(this.#pointerDown.sp + delta / (this.#cached.smax || 1), 0, 1);
        this.scrollTo(progress);
    }

    #onPointerUp = e => {
        if (e.pointerId !== this.#pointerDown.pid) return;
        this.#endDrag();
        this.#startHideTimer();
    };

    #endDrag = (force = false) => {
        if (!this.#state.isDragging && !force) return;

        try { if(this.#pointerDown.pid !== undefined)  this.stage.releasePointerCapture(this.#pointerDown.pid); }
        catch (_) {}

        this.stage.removeEventListener('pointermove', this.#onPointerMove);
        this.stage.removeEventListener('pointerup', this.#onPointerUp);
        this.stage.removeEventListener('pointercancel', this.#onPointerUp);

        this.#state.isDragging = false;
    };

    #onScroll = () => {
        const mode = this.#state.autohideMode;
        if (this.#state.autohide && (mode === 'scroll' || mode === 'all')) {
            this.show();
        }
        this.requestRender();
    }

    #onWindowResize = () => this.requestRender(true);

    // Private Logic 

    #startHideTimer() {
        if (!this.#state.autohide || this.#state.isDragging || this.#state.isHoveredStage) return;
        
        if (this.#state.isHoveredScroller) {
            const mode = this.#state.autohideMode;
            if (mode === 'hover' || mode === 'all') return;
        }
        
        this.#clearHideTimer();
        this.#hideTimer = setTimeout(() => this.hide(), this.#state.autohideDelay);
    }

    #clearHideTimer() {
        if (this.#hideTimer) {
            clearTimeout(this.#hideTimer);
            this.#hideTimer = null;
        }
    }

    #initObservers() {
        this.#ro = new ResizeObserver(() => this.requestRender(true));
        this.#mo = new MutationObserver((mutations) => {
            let needsUpdate = false;
            for (const m of mutations) {
                if (m.addedNodes.length || m.removedNodes.length) {
                    needsUpdate = true;
                    this.#observeChildren(m.addedNodes);
                    m.removedNodes.forEach(node => {
                        if (node instanceof HTMLElement) this.#ro.unobserve(node);
                    });
                }
            }
            if (needsUpdate) this.requestRender(true);
        });
    }

    #setupObservers() {
        if (!this.scroller) return;

        const isRoot = this.#isRoot(this.scroller);
        const scrollTarget = (this.scroller === document.scrollingElement) ? document: this.scroller;

        scrollTarget.addEventListener('scroll', this.#onScroll, { passive: true });
        if (isRoot) window.addEventListener('resize', this.#onWindowResize);

        this.scroller.addEventListener('pointerenter', this.#onScrollerEnter);
        this.scroller.addEventListener('pointerleave', this.#onScrollerLeave);

        this.#ro.observe(this.scroller);
        this.#observeChildren(this.scroller.children);
        this.#mo.observe(this.scroller, { childList: true, subtree: false });
    }

    #cleanupObservers() {
        if (!this.scroller) return;

        const isRoot = this.#isRoot(this.scroller);
        const scrollTarget = (this.scroller === document.scrollingElement) ? document: this.scroller;

        scrollTarget.removeEventListener('scroll', this.#onScroll);
        if (isRoot) window.removeEventListener('resize', this.#onWindowResize);
        
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
        this.#state.autohide = this.hasAttribute('data-autohide');
        this.#state.autohideMode = this.getAttribute('data-autohide-mode') || 'all';
        this.#state.autohideDelay = parseInt(this.getAttribute('data-autohide')) || 500;
        if(!this.#state.autohide) this.show();
    }

    #updateCache() {
        if (!this.scroller || !this.isLive) return;

        if (!this.#styleCache) {
            const styles = getComputedStyle(this);
            this.#styleCache = { tMin: parseInt(styles.getPropertyValue('--thumb-minsize')) || 50 };
        }
        
        this.#vert = !this.hasAttribute('data-horizontal');      
        this.#cached.tMin = this.#styleCache.tMin;
        
        this.#cached.sh = Math.ceil(this.scroller.scrollHeight || 0);
        this.#cached.sw = Math.ceil(this.scroller.scrollWidth || 0);   
        this.#cached.ch = this.scroller.clientHeight;
        this.#cached.cw = this.scroller.clientWidth;
        
        this.#cached.sch = this.stage.clientHeight || 0;
        this.#cached.scw = this.stage.clientWidth || 0;       
        
        const scrollSize = this.#vert ? this.#cached.sh : this.#cached.sw;
        const clientSize = this.#vert ? this.#cached.ch : this.#cached.cw;
        const stageSize = this.#vert ? this.#cached.sch : this.#cached.scw;

        const tSize = scrollSize > clientSize ? Math.max(stageSize * clientSize / scrollSize, Math.min(this.#cached.tMin, stageSize * 0.8)) : 0;
        
        const tSizeFixed = parseFloat(tSize.toFixed(2));
        if (this.#vert) {
            this.#cached.tch = tSizeFixed;
        } else {
            this.#cached.tcw = tSizeFixed;
        }
        
        this.#cached.max = Math.max(0, scrollSize - clientSize);
        this.#cached.smax = Math.max(0, stageSize - tSizeFixed);
    }

    #isRoot(el) {
        return (el === document.documentElement || el === document.scrollingElement || el === document.body);
    }

    #checkDoc = el => { 
        if (!el || el !== document.body) return el;

        const bodyStyle = window.getComputedStyle(document.body);
        
        if (bodyStyle.overflowY === 'auto' || bodyStyle.overflowY === 'scroll' || bodyStyle.overflowX === 'auto' || bodyStyle.overflowX === 'scroll') {
            if (document.body.scrollHeight > window.innerHeight) return document.body;
        }

        return document.scrollingElement || document.documentElement;
    };

    #render() {
        if (!this.scroller || !this.isLive) return;

        const vert = this.#vert;
        this.#cached.st = vert ? this.scroller.scrollTop : this.scroller.scrollLeft;
        
        const currentProgress = this.#cached.max > 0 ? (this.#cached.st / this.#cached.max) : 0;
        this.#cached.sp = currentProgress > 0.999 ? 1 : currentProgress;

        const hasScroll = vert ? (this.#cached.sh > this.#cached.ch) : (this.#cached.sw > this.#cached.cw);
        const sbHasSize = (vert ? this.#cached.sch : this.#cached.scw) > 0;
        const canBeVisible = hasScroll && sbHasSize;
        
        const thumbSize = vert ? this.#cached.tch : this.#cached.tcw;
        const p = parseFloat((this.#cached.sp * this.#cached.smax).toFixed(2));

        if (this.#lastRender.p === p && 
            this.#lastRender.size === thumbSize && 
            this.#lastRender.visible === canBeVisible) return;

        if (this.#lastRender.size !== thumbSize) {
            this.thumbStage.style[vert ? 'height' : 'width'] = thumbSize + 'px';
            this.thumbStage.style[vert ? 'width' : 'height'] = ''; 
        }

        if (canBeVisible) {
            this.thumbStage.style.transform = vert ? `translate3d(0, ${p}px, 0)` : `translate3d(${p}px, 0, 0)`; 
        } 

        if (!this.#state.autohide) {
            if (canBeVisible) this.stage.classList.add('visible');
            else this.stage.classList.remove('visible');
        }

        this.#lastRender.p = p;
        this.#lastRender.size = thumbSize;
        this.#lastRender.visible = canBeVisible;
    }
}

customElements.define('scroll-bar', ScrollBarElement);

// factory function
function ScrollBar(scroller, horizontal = false) {
    const elem = document.createElement('scroll-bar');
    if (scroller) elem.setScroller(scroller);
    if (horizontal) elem.setAttribute('data-horizontal', '');
    return elem;
}

export { ScrollBar };
