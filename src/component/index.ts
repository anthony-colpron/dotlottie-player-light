import { html, LitElement, nothing } from 'lit'
import {
  customElement,
  property,
  query,
  state
} from 'lit/decorators.js'
import Lottie from 'lottie-web/build/player/lottie_light.js'

import {
  aspectRatio,
  download,
  frameOutput,
  getAnimationData,
  getFilename,
  handleErrors,
  useId,
} from './functions'
import {
  PlayMode,
  PlayerEvents,
  PlayerState
} from './types'

import type { CSSResult } from 'lit'
import type {
  AnimationConfig,
  AnimationDirection,
  AnimationEventName,
  AnimationItem,
  AnimationSegment,
  RendererType
} from 'lottie-web'
import type {
  Autoplay,
  Controls,
  Loop,
  LottieJSON,
  ObjectFit,
  PreserveAspectRatio,
  Subframe
} from './types'

import styles from './styles'

/**
 * dotLottie Player Web Component
 * @export
 * @class DotLottiePlayer
 * @extends { LitElement }
 */
@customElement('dotlottie-player')
export class DotLottiePlayer extends LitElement {

  /**
   * Autoplay
   */
  @property({ type: Boolean, reflect: true })
  autoplay?: Autoplay

  /**
   * Background color
   */
  @property({ type: String })
  background?: string = 'transparent'

  /**
   * Display controls
   */
  @property({ type: Boolean, reflect: true })
  controls?: Controls = false

  /**
   * Number of times to loop
   */
  @property({ type: Number })
  count?: number

  /**
   * Player state
   */
  @property({ type: String })
  currentState?: PlayerState = PlayerState.Loading

  /**
   * Description for screen readers
   */
  @property({ type: String })
  description?: string

  /**
   * Direction of animation
   */
  @property({ type: Number })
  direction?: AnimationDirection = 1

  /**
   * Whether to play on mouseover
   */
  @property({ type: Boolean })
  hover?= false

  /**
   * Intermission
   */
  @property({ type: Number })
  intermission?= 0

  /**
   * Whether to loop
   */
  @property({ type: Boolean, reflect: true })
  loop?: Loop = false

  /**
   * Play mode
   */
  @property({ type: String })
  mode?: PlayMode = PlayMode.Normal

  /**
   * Resizing to container
  */
  @property({ type: String })
  objectfit?: ObjectFit = 'contain'

  /**
   * Resizing to container (Deprecated)
  */
  @property({ type: String })
  preserveAspectRatio?: PreserveAspectRatio

  /**
   * Renderer to use (svg, canvas or html)
   */
  @property({ type: String })
  renderer?: RendererType = 'svg'

  /**
   * Segment
   */
  @property({ type: Array })
  segment?: AnimationSegment

  /**
   * Speed
   */
  @property({ type: Number })
  speed?: number = 1

  /**
   * JSON/dotLottie data or URL
   */
  @property({ type: String })
  src!: string

  /**
   * Subframe
   */
  @property({ type: Boolean })
  subframe?: Subframe = true

  /**
   * Animaiton Container
   */
  @query('.animation')
  protected container!: HTMLElement

  /**
   * Whether settings toolbar is open
   */
  @state()
  private _isSettingsOpen = false

  /**
   * Seeker
   */
  @state()
  private _seeker = 0

  /**
   * Which animation to show, if several
   */
  @state()
  private _currentAnimation = 0

  private _intersectionObserver?: IntersectionObserver
  private _lottieInstance: AnimationItem | null = null
  private _identifier = this.id || useId('dotlottie')
  private _errorMessage = 'Something went wrong'

  private _animations!: LottieJSON[]

  private _playerState = {
    prev: PlayerState.Loading,
    count: 0,
    loaded: false,
  }

  /**
   * Get options from props
   * @returns { AnimationConfig }
   */
  private _getOptions() {
    const preserveAspectRatio =
      this.preserveAspectRatio ?? (this.objectfit && aspectRatio(this.objectfit)),

      initialSegment
        = !this.segment ||
          this.segment.some(val => val < 0) ?
          undefined :
          this.segment.every(val => val > 0) ?
            ([this.segment[0] - 1, this.segment[1] - 1] as AnimationSegment) :
            this.segment,

      options: AnimationConfig<'svg'> =
      {
        container: this.container,
        loop: !!this.loop,
        autoplay: !!this.autoplay,
        renderer: 'svg',
        initialSegment,
        rendererSettings: {
          imagePreserveAspectRatio: preserveAspectRatio,
          hideOnTransparent: true,
          preserveAspectRatio,
          progressiveLoad: true,
        }
      }

    return options
  }

  /**
   * Initialize Lottie Web player
   * @param { string | LottieJSON } src URL to lottie animation, or raw JSON data
   */
  public async load(
    src: string | LottieJSON,
  ) {
    if (!this.shadowRoot)
      return

    // Load the resource
    try {
      const { animations } =
        await getAnimationData(src)

      if (!animations || animations.some(animation => !this._isLottie(animation))) {
        throw new Error('Broken or corrupted file')
      }

      this._animations = animations

      // Clear previous animation, if any
      if (this._lottieInstance) this._lottieInstance.destroy()

      // Initialize lottie player and load animation
      this._lottieInstance = Lottie.loadAnimation({
        ...this._getOptions(),
        animationData: animations[this._currentAnimation],
      })
    } catch (err) {
      this._errorMessage = handleErrors(err).message

      this.currentState = PlayerState.Error

      this.dispatchEvent(new CustomEvent(PlayerEvents.Error))
      return
    }

    this._addEventListeners()

    // Set initial playback speed and direction
    this.setSpeed(this.speed)
    this.setDirection(this.direction ?? 1)
    this.setSubframe(!!this.subframe)

    // Start playing if autoplay is enabled
    if (this.autoplay) {
      if (this.direction === -1) this.seek('99%')
      this.play()
    }
  }

  /**
   * Add event listeners
   */
  private _addEventListeners() {
    if (!this._lottieInstance)
      return

    // Calculate and save the current progress of the animation
    this._lottieInstance.addEventListener<AnimationEventName>('enterFrame', () => {
      if (this._lottieInstance) {
        const { currentFrame, totalFrames } = this._lottieInstance
        this._seeker = Math.floor((currentFrame / totalFrames) * 100)

        this.dispatchEvent(
          new CustomEvent(PlayerEvents.Frame, {
            detail: {
              frame: currentFrame,
              seeker: this._seeker,
            },
          }),
        )
      }
    })

    // Handle animation play complete
    this._lottieInstance.addEventListener<AnimationEventName>('complete', () => {
      this.currentState = PlayerState.Completed
      this.dispatchEvent(new CustomEvent(PlayerEvents.Complete))
    })

    //Handle complete loop
    const loopComplete = () => {
      if (!this._lottieInstance) {
        return
      }

      const {
        firstFrame,
        totalFrames,
        playDirection,
      } = this._lottieInstance

      if (this.count) {

        this.mode === PlayMode.Bounce ?
          this._playerState.count += 1 : this._playerState.count += 0.5

        if (this._playerState.count >= this.count) {
          this.setLooping(false)

          this.currentState = PlayerState.Completed
          this.dispatchEvent(new CustomEvent(PlayerEvents.Complete))

          return
        }
      }

      this.dispatchEvent(new CustomEvent(PlayerEvents.Loop))

      if (this.mode === PlayMode.Bounce) {
        this._lottieInstance?.goToAndStop(
          playDirection === -1 ? firstFrame : totalFrames * .99, true
        )

        this._lottieInstance?.setDirection(playDirection * -1 as AnimationDirection)

        return setTimeout(() => {
          this._lottieInstance?.play()
        }, this.intermission)
      }

      this._lottieInstance?.goToAndStop(
        playDirection === -1 ? totalFrames * .99 : firstFrame, true
      )

      return setTimeout(() => {
        this._lottieInstance?.play()
      }, this.intermission)
    }

    this._lottieInstance.addEventListener<AnimationEventName>('loopComplete', loopComplete)

    // Handle lottie-web ready event
    this._lottieInstance.addEventListener<AnimationEventName>('DOMLoaded', () => {
      this._playerState.loaded = true
      this.dispatchEvent(new CustomEvent(PlayerEvents.Ready))
    })

    // Handle animation data load complete
    this._lottieInstance.addEventListener<AnimationEventName>('data_ready', () => {
      this.dispatchEvent(new CustomEvent(PlayerEvents.Load))
    })

    // Set error state when animation load fail event triggers
    this._lottieInstance.addEventListener<AnimationEventName>('data_failed', () => {

      this.currentState = PlayerState.Error
      this.dispatchEvent(new CustomEvent(PlayerEvents.Error))
    })

    if (this.container) {
      // Set handlers to auto play animation on hover if enabled
      this.container.addEventListener('mouseenter', () => {
        if (this.hover && this.currentState !== PlayerState.Playing) {
          this.play()
        }
      })
      this.container.addEventListener('mouseleave', () => {
        if (this.hover && this.currentState === PlayerState.Playing) {
          this.stop()
        }
      })
    }
  }

  /**
   * Handle visibility change events
   */
  private _onVisibilityChange() {
    if (document.hidden && this.currentState === PlayerState.Playing) {
      this._freeze()
    } else if (this.currentState === PlayerState.Frozen) {
      this.play()
    }
  }

  /**
   * Handles click and drag actions on the progress track
   * @param { Event & { HTMLInputElement } } event
   */
  private _handleSeekChange({ target }: Event) {
    if (
      !(target instanceof HTMLInputElement) ||
      !this._lottieInstance ||
      isNaN(Number(target.value))
    )
      return

    this.seek(
      Math.floor((Number(target.value) / 100) * this._lottieInstance.totalFrames)
    )

    setTimeout(() => {
      if (target.parentElement instanceof HTMLFormElement) {
        target.parentElement.reset()
      }
    }, 100)
  }

  private _isLottie(json: LottieJSON) {
    const mandatory: string[] =
      ['v', 'ip', 'op', 'layers', 'fr', 'w', 'h']

    return mandatory.every((field: string) =>
      Object.prototype.hasOwnProperty.call(json, field))
  }

  /**
   * Returns the lottie-web instance used in the component
   */
  public getLottie() {
    return this._lottieInstance
  }

  /**
   * Play
   */
  public play() {
    if (!this._lottieInstance) return
    if (this.currentState) {
      this._playerState.prev = this.currentState
    }

    this._lottieInstance.play()
    setTimeout(() => {
      this.currentState = PlayerState.Playing
    }, 0)

    this.dispatchEvent(new CustomEvent(PlayerEvents.Play))
  }

  /**
   * Pause
   */
  public pause() {
    if (!this._lottieInstance) return
    if (this.currentState) {
      this._playerState.prev = this.currentState
    }
    this._lottieInstance.pause()
    setTimeout(() => {
      this.currentState = PlayerState.Paused
    }, 0)

    this.dispatchEvent(new CustomEvent(PlayerEvents.Pause))
  }

  /**
   * Stop
   */
  public stop() {
    if (!this._lottieInstance) return
    if (this.currentState) {
      this._playerState.prev = this.currentState
    }
    this._playerState.count = 0
    this._lottieInstance.stop()
    setTimeout(() => {
      this.currentState = PlayerState.Stopped
    }, 0)

    this.dispatchEvent(new CustomEvent(PlayerEvents.Stop))
  }

  /**
   * Destroy animation and element
   */
  public destroy() {
    if (!this._lottieInstance) return

    this.currentState = PlayerState.Destroyed

    this._lottieInstance.destroy()
    this._lottieInstance = null
    this.dispatchEvent(new CustomEvent(PlayerEvents.Destroyed))
    this.remove()
  }

  /**
   * Seek to a given frame
   * @param { number | string } value Frame to seek to
   */
  public seek(value: number | string) {
    if (!this._lottieInstance) return

    // Extract frame number from either number or percentage value
    const matches = value.toString().match(/^([0-9]+)(%?)$/)
    if (!matches) {
      return
    }

    // Calculate and set the frame number
    const frame =
      Math.floor(matches[2] === '%' ?
        (this._lottieInstance.totalFrames * Number(matches[1])) / 100 :
        Number(matches[1]))

    // Set seeker to new frame number
    this._seeker = frame

    // Send lottie player to the new frame
    if (
      this.currentState === PlayerState.Playing ||
      (this.currentState === PlayerState.Frozen &&
        this._playerState.prev === PlayerState.Playing)
    ) {
      this._lottieInstance.goToAndPlay(frame, true)
      this.currentState = PlayerState.Playing
    } else {
      this._lottieInstance.goToAndStop(frame, true)
      this._lottieInstance.pause()
    }
  }

  /**
   * Snapshot and download the current frame as SVG
   */
  public snapshot() {
    if (!this.shadowRoot) return

    // Get SVG element and serialize markup
    const svgElement = this.shadowRoot.querySelector('.animation svg'),
      data =
        svgElement instanceof Node ?
          new XMLSerializer().serializeToString(svgElement) : null

    if (!data) {
      console.error('Could not serialize data')
      return
    }

    download(
      data,
      {
        name: `${getFilename(this.src)}-${frameOutput(this._seeker)}.svg`,
        mimeType: 'image/svg+xml'
      }
    )

    return data
  }

  /**
   * Toggles subframe, for more smooth animations
   * @param { boolean } value Whether animation uses subframe
   */
  public setSubframe(value: boolean) {
    if (!this._lottieInstance) return
    this.subframe = value
    this._lottieInstance.setSubframe(value)
  }

  /**
   * Freeze animation.
   * This internal state pauses animation and is used to differentiate between
   * user requested pauses and component instigated pauses.
   */
  private _freeze() {
    if (!this._lottieInstance) return

    if (this.currentState) {
      this._playerState.prev = this.currentState
    }
    this._lottieInstance.pause()
    setTimeout(() => {
      this.currentState = PlayerState.Frozen
    }, 0)

    this.dispatchEvent(new CustomEvent(PlayerEvents.Freeze))
  }

  /**
   * Reload animation
   */
  public async reload() {
    if (!this._lottieInstance) return

    this._lottieInstance.destroy()

    if (this.src) {
      await this.load(this.src)
    }
  }

  /**
   * Set animation playback speed
   * @param { number } value Playback speed
   */
  public setSpeed(value = 1) {
    if (!this._lottieInstance) return
    this.speed = value
    this._lottieInstance.setSpeed(value)
  }

  /**
   * Animation play direction
   * @param { AnimationDirection } value Animation direction
   */
  public setDirection(value: AnimationDirection) {
    if (!this._lottieInstance) return
    this.direction = value
    this._lottieInstance.setDirection(value)
  }

  /**
   * Set loop
   * @param { boolean } value
   */
  public setLooping(value: boolean) {
    if (this._lottieInstance) {
      this.loop = value
      this._lottieInstance.setLoop(value)
    }
  }

  /**
   * Toggle playing state
   */
  public togglePlay() {
    if (!this._lottieInstance) return

    const { currentFrame, playDirection, totalFrames } = this._lottieInstance
    if (this.currentState === PlayerState.Playing) {
      return this.pause()
    }
    if (this.currentState === PlayerState.Completed) {
      this.currentState = PlayerState.Playing
      if (this.mode === PlayMode.Bounce) {
        this.setDirection(playDirection * -1 as AnimationDirection)
        return this._lottieInstance.goToAndPlay(currentFrame, true)
      }
      if (playDirection === -1) {
        return this._lottieInstance.goToAndPlay(totalFrames, true)
      }
      return this._lottieInstance.goToAndPlay(0, true)
    }
    return this.play()
  }

  /**
   * Toggle loop
   */
  public toggleLooping() {
    this.setLooping(!this.loop)
  }

  /**
   * Toggle Boomerang
   */
  public toggleBoomerang() {
    if (this.mode === PlayMode.Normal) {
      this.mode = PlayMode.Bounce
    } else {
      this.mode = PlayMode.Normal
    }
  }

  /**
   * Toggle show Settings
   */
  private _toggleSettings(flag?: boolean) {
    if (flag === undefined) {
      this._isSettingsOpen = !this._isSettingsOpen
    } else {
      this._isSettingsOpen = flag
    }
  }

  private _switchInstance() {
    // Clear previous animation
    if (this._lottieInstance) this._lottieInstance.destroy()

    // Re-initialize lottie player
    this._lottieInstance = Lottie.loadAnimation({
      ...this._getOptions(),
      animationData: this._animations[this._currentAnimation],
    })

    // Add event listeners to new Lottie instance
    this._addEventListeners()

    this._lottieInstance.goToAndPlay(0, true)
    this.currentState = PlayerState.Playing
  }

  /**
   * Skip to next animation
   */
  public next() {
    this._currentAnimation++
    this._switchInstance()
  }

  /**
   * Skip to previous animation
   */
  public prev() {
    this._currentAnimation--
    this._switchInstance()
  }

  /**
   * Return the styles for the component
   * @returns { CSSResult }
   */
  static override get styles(): CSSResult {
    return styles
  }

  /**
   * Initialize everything on component first render
   */
  override connectedCallback() {
    super.connectedCallback()

    // Add listener for Visibility API's change event.
    if (typeof document.hidden !== 'undefined') {
      document.addEventListener('visibilitychange', this._onVisibilityChange)
    }
  }

  protected override async firstUpdated() {
    // Add intersection observer for detecting component being out-of-view.
    if ('IntersectionObserver' in window) {
      this._intersectionObserver =
        new IntersectionObserver(entries => {
          if (entries[0].isIntersecting) {
            if (!document.hidden && this.currentState === PlayerState.Frozen) {
              this.play()
            }
          } else if (this.currentState === PlayerState.Playing) {
            this._freeze()
          }
        })

      this._intersectionObserver.observe(this.container)
    }

    // Setup lottie player
    if (this.src) {
      await this.load(this.src)
    }
    this.dispatchEvent(new CustomEvent(PlayerEvents.Rendered))
  }

  /**
   * Cleanup on component destroy
   */
  override disconnectedCallback() {
    super.disconnectedCallback()

    // Remove intersection observer for detecting component being out-of-view
    if (this._intersectionObserver) {
      this._intersectionObserver.disconnect()
      this._intersectionObserver = undefined
    }

    // Destroy the animation instance
    if (this._lottieInstance) this._lottieInstance.destroy()

    // Remove the attached Visibility API's change event listener
    document.removeEventListener('visibilitychange', this._onVisibilityChange)
  }

  protected renderControls() {
    const isPlaying = this.currentState === PlayerState.Playing,
      isPaused = this.currentState === PlayerState.Paused,
      isStopped = this.currentState === PlayerState.Stopped,
      isError = this.currentState === PlayerState.Error

    return html`
      <div
        class=${`lottie-controls toolbar ${isError ? 'has-error' : ''}`}
        aria-label="Lottie Animation controls"
      >
        <button
          @click=${this.togglePlay}
          data-active=${isPlaying || isPaused}
          tabindex="0"
          aria-label="Toggle Play/Pause"
        >
        ${isPlaying ?
        html`
          <svg width="24" height="24" aria-hidden="true" focusable="false">
            <path d="M14.016 5.016H18v13.969h-3.984V5.016zM6 18.984V5.015h3.984v13.969H6z" />
          </svg>
          ` :
        html`
          <svg width="24" height="24" aria-hidden="true" focusable="false">
            <path d="M8.016 5.016L18.985 12 8.016 18.984V5.015z" />
          </svg>
        `}
        </button>
        <button
          @click=${this.stop}
          data-active=${isStopped}
          tabindex="0"
          aria-label="Stop"
        >
          <svg width="24" height="24" aria-hidden="true" focusable="false">
            <path d="M6 6h12v12H6V6z" />
          </svg>
        </button>
        ${this._animations?.length > 1 ?
        html`
          ${this._currentAnimation > 0 ?
            html`
            <button
              @click=${this.prev}
              tabindex="0"
              aria-label="Previous animation"
            >
              <svg width="24" height="24" aria-hidden="true" focusable="false">
                <path d="M17.9 18.2 8.1 12l9.8-6.2v12.4zm-10.3 0H6.1V5.8h1.5v12.4z"/>
              </svg>
            </button>
          ` : nothing}
          ${(this._currentAnimation + 1) < this._animations?.length ?
            html`
            <button
              @click=${this.next}
              tabindex="0"
              aria-label="Next animation"
            >
              <svg width="24" height="24" aria-hidden="true" focusable="false">
                <path d="m6.1 5.8 9.8 6.2-9.8 6.2V5.8zM16.4 5.8h1.5v12.4h-1.5z"/>
              </svg>
            </button>
          ` : nothing}
        ` : nothing}
        <form class="progress-container">
          <input
            class="seeker"
            type="range"
            min="0"
            max="100"
            step="1"
            value=${this._seeker}
            @change=${this._handleSeekChange}
            @mousedown=${this._freeze}
            aria-valuemin="0"
            aria-valuemax="100"
            role="slider"
            aria-valuenow=${this._seeker}
            tabindex="0"
            aria-label="Slider for search"
          />
          <progress
            min="0"
            max="100"
            value=${this._seeker}
          >
          </progress>
        </form>
        <button
          @click=${this.toggleLooping}
          data-active=${this.loop}
          tabindex="0"
          aria-label="Toggle looping"
        >
          <svg width="24" height="24" aria-hidden="true" focusable="false">
            <path
              d="M17.016 17.016v-4.031h1.969v6h-12v3l-3.984-3.984 3.984-3.984v3h10.031zM6.984 6.984v4.031H5.015v-6h12v-3l3.984 3.984-3.984 3.984v-3H6.984z"
            />
          </svg>
        </button>
        <button
          @click=${this.toggleBoomerang}
          data-active=${this.mode === PlayMode.Bounce}
          aria-label="Toggle boomerang"
          tabindex="0"
        >
          <svg width="24" height="24" aria-hidden="true" focusable="false">
            <path
              d="m11.8 13.2-.3.3c-.5.5-1.1 1.1-1.7 1.5-.5.4-1 .6-1.5.8-.5.2-1.1.3-1.6.3s-1-.1-1.5-.3c-.6-.2-1-.5-1.4-1-.5-.6-.8-1.2-.9-1.9-.2-.9-.1-1.8.3-2.6.3-.7.8-1.2 1.3-1.6.3-.2.6-.4 1-.5.2-.2.5-.2.8-.3.3 0 .7-.1 1 0 .3 0 .6.1.9.2.9.3 1.7.9 2.4 1.5.4.4.8.7 1.1 1.1l.1.1.4-.4c.6-.6 1.2-1.2 1.9-1.6.5-.3 1-.6 1.5-.7.4-.1.7-.2 1-.2h.9c1 .1 1.9.5 2.6 1.4.4.5.7 1.1.8 1.8.2.9.1 1.7-.2 2.5-.4.9-1 1.5-1.8 2-.4.2-.7.4-1.1.4-.4.1-.8.1-1.2.1-.5 0-.9-.1-1.3-.3-.8-.3-1.5-.9-2.1-1.5-.4-.4-.8-.7-1.1-1.1h-.3zm-1.1-1.1c-.1-.1-.1-.1 0 0-.3-.3-.6-.6-.8-.9-.5-.5-1-.9-1.6-1.2-.4-.3-.8-.4-1.3-.4-.4 0-.8 0-1.1.2-.5.2-.9.6-1.1 1-.2.3-.3.7-.3 1.1 0 .3 0 .6.1.9.1.5.4.9.8 1.2.5.4 1.1.5 1.7.5.5 0 1-.2 1.5-.5.6-.4 1.1-.8 1.6-1.3.1-.3.3-.5.5-.6zM13 12c.5.5 1 1 1.5 1.4.5.5 1.1.9 1.9 1 .4.1.8 0 1.2-.1.3-.1.6-.3.9-.5.4-.4.7-.9.8-1.4.1-.5 0-.9-.1-1.4-.3-.8-.8-1.2-1.7-1.4-.4-.1-.8-.1-1.2 0-.5.1-1 .4-1.4.7-.5.4-1 .8-1.4 1.2-.2.2-.4.3-.5.5z"
            />
          </svg>
        </button>
        <button
          @click=${({ target }: Event) => {
        this._toggleSettings()
        // Because Safari does not add focus on click, we need to add it manually, so the onblur event will fire
        if (target instanceof HTMLElement) {
          target.focus()
        }
      }}
          @blur=${() => setTimeout(() => this._toggleSettings(false), 200)}
          aria-label="Settings"
          aria-haspopup="true"
          aria-expanded=${!!this._isSettingsOpen}
          aria-controls=${`${this._identifier}-settings`}
        >
          <svg width="24" height="24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="5.4" r="2.5"/>
            <circle cx="12" cy="12" r="2.5"/>
            <circle cx="12" cy="18.6" r="2.5"/>
          </svg>
        </button>
        <div
          id=${`${this._identifier}-settings`}
          class="popover"
          style="display:${this._isSettingsOpen ? 'block' : 'none'}"
        >
          <button
            @click=${this.snapshot}
            aria-label="Download still image"
            tabindex="0"
          >
            <svg width="24" height="24" aria-hidden="true" focusable="false">
              <path
                d="M16.8 10.8 12 15.6l-4.8-4.8h3V3.6h3.6v7.2h3zM12 15.6H3v4.8h18v-4.8h-9zm7.8 2.4h-2.4v-1.2h2.4V18z"
              />
            </svg> Download still image
          </button>
        </div>
      </div>
    `
  }

  protected override render() {
    return html`
      <figure
        class=${`animation-container main`}
        data-controls=${this.controls}
        lang=${this.description ? document?.documentElement?.lang : 'en'}
        role="img"
        aria-label=${this.description ?? 'Lottie animation'}
        data-loaded=${this._playerState.loaded}
      >
        <div
          class="animation"
          style="background:${this.background}"
        >
          ${this.currentState === PlayerState.Error ?
        html`
              <div class="error">
                <svg
                  preserveAspectRatio="xMidYMid slice"
                  xmlns="http://www.w3.org/2000/svg"
                  xml:space="preserve"
                  width="1920"
                  height="1080"
                  viewBox="0 0 1920 1080"
                >
                  <path fill="#fff" d="M0 0h1920v1080H0z"/>
                  <path fill="#3a6d8b" d="M1190.2 531 1007 212.4c-22-38.2-77.2-38-98.8.5L729.5 531.3c-21.3 37.9 6.1 84.6 49.5 84.6l361.9.3c43.7 0 71.1-47.3 49.3-85.2zM937.3 288.7c.2-7.5 3.3-23.9 23.2-23.9 16.3 0 23 16.1 23 23.5 0 55.3-10.7 197.2-12.2 214.5-.1 1-.9 1.7-1.9 1.7h-18.3c-1 0-1.8-.7-1.9-1.7-1.4-17.5-13.4-162.9-11.9-214.1zm24.2 283.8c-13.1 0-23.7-10.6-23.7-23.7s10.6-23.7 23.7-23.7 23.7 10.6 23.7 23.7-10.6 23.7-23.7 23.7zM722.1 644h112.6v34.4h-70.4V698h58.8v31.7h-58.8v22.6h72.4v36.2H722.1V644zm162 57.1h.6c8.3-12.9 18.2-17.8 31.3-17.8 3 0 5.1.4 6.3 1v32.6h-.8c-22.4-3.8-35.6 6.3-35.6 29.5v42.3h-38.2V685.5h36.4v15.6zm78.9 0h.6c8.3-12.9 18.2-17.8 31.3-17.8 3 0 5.1.4 6.3 1v32.6h-.8c-22.4-3.8-35.6 6.3-35.6 29.5v42.3h-38.2V685.5H963v15.6zm39.5 36.2c0-31.3 22.2-54.8 56.6-54.8 34.4 0 56.2 23.5 56.2 54.8s-21.8 54.6-56.2 54.6c-34.4-.1-56.6-23.3-56.6-54.6zm74 0c0-17.4-6.1-29.1-17.8-29.1-11.7 0-17.4 11.7-17.4 29.1 0 17.4 5.7 29.1 17.4 29.1s17.8-11.8 17.8-29.1zm83.1-36.2h.6c8.3-12.9 18.2-17.8 31.3-17.8 3 0 5.1.4 6.3 1v32.6h-.8c-22.4-3.8-35.6 6.3-35.6 29.5v42.3h-38.2V685.5h36.4v15.6z"/>
                  <path fill="none" d="M718.9 807.7h645v285.4h-645z"/>
                  <text
                    fill="#3a6d8b"
                    style="text-align:center;position:absolute;left:100%;font-size:47px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'.SFNSText-Regular',sans-serif;"
                    x="50%"
                    y="848.017"
                    text-anchor="middle"
                  >${this._errorMessage}</text>
                </svg>
              </div>` : nothing
      }
        </div>
        ${this.controls ? this.renderControls() : nothing}
      </figure>
    `
  }
}