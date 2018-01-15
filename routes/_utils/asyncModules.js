const importURLSearchParams = () => import(
  /* webpackChunkName: 'url-search-params' */ 'url-search-params'
  ).then(Params => {
  window.URLSearchParams = Params
  Object.defineProperty(window.URL.prototype, 'searchParams', {
    get() {
      return new Params(this.search)
    }
  })
})

const importToast = () => import(
  /* webpackChunkName: 'toast' */ './toast'
  ).then(mod => mod.toast)

const importTimeline = () => import(
  /* webpackChunkName: 'Timeline' */ '../_components/Timeline.html'
  ).then(mod => mod.default)

export {
  importURLSearchParams,
  importToast,
  importTimeline
}