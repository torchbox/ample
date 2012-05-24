(function() {
	var mimeTypesByTypeIdentifier = {
		'mp3': 'audio/mpeg; codecs=mp3',
		'ogg-vorbis': 'audio/ogg; codecs=vorbis'
	};

	/* helper function for creating DOM elements */
	function createDOMElement(name, attrs) {
		var elem = document.createElement(name);
		for (var attrName in attrs) {
			elem.setAttribute(attrName, attrs[attrName]);
		}
		return elem;
	}

	/* A non-active audio element used for testing canPlayType */
	var testAudioElem = createDOMElement('audio');
	var hasHtmlAudio = testAudioElem.canPlayType;

	/* Representation of an individual sound file (which may be one of several passed to Ample.openSound) */
	function Source(typeIdentifier, url) {
		var self = {
			typeIdentifier: typeIdentifier,
			url: url,
			mimeType: mimeTypesByTypeIdentifier[typeIdentifier]
		};

		/* return a truthy value (specifically, the string 'maybe' or 'probably') if this source's type
		is one that can be played through native HTML audio */
		self.canPlayTypeNatively = function() {
			if (!hasHtmlAudio || !self.mimeType) return false;
			return testAudioElem.canPlayType(self.mimeType);
		};

		var data;
		self.getData = function(onSuccess, onFailure) {
			if (data) {
				onSuccess(data);
				return;
			}

			var request = new XMLHttpRequest();

			request.addEventListener('error', function(e) {
				onFailure();
			});

			request.addEventListener('load', function(e) {
				data = request.response;
				onSuccess(data);
			});

			/* trigger XHR */
			request.open('GET', self.url, true);
			request.responseType = "arraybuffer";
			request.send();
		};

		return self;
	}

	/* a Driver encapsulates a particular sound-generating mechanism and exposes a single
	public endpoint, openSound, which accepts a sound spec object, onSuccess callback and
	onFailure callback, and asynchronously creates a sound object from the sound spec.
	
	Note that the sound spec object may itself contain onSuccess and onFailure callbacks,
	but it is NOT the responsibility of the driver to call these.
	*/
	function BaseDriver() {
		var self = {};
		self.driverName = 'BaseDriver';
		
		/* subclasses override self.init to perform one-time initialisation */
		self.init = function(onSuccess, onFailure) {
			/* default no-initialisation-required initialiser, immediately returns success */
			onSuccess();
		};
		
		var initStarted = false;
		var initSucceeded = false;
		var initFailed = false;
		var soundSpecsWaitingForInit = [];
		
		self.openSound = function(soundSpec, onSuccess, onFailure) {
			function enqueueSoundSpecUntilInitCompleted() {
				soundSpecsWaitingForInit.push({
					soundSpec: soundSpec,
					onSuccess: onSuccess,
					onFailure: onFailure
				});
			}
			
			if (!initStarted) {
				initStarted = true;
				enqueueSoundSpecUntilInitCompleted();
				self.init(function() {
					/* init succeeded - proceed to open all queued sound specs */
					initSucceeded = true;
					for (var i = 0; i < soundSpecsWaitingForInit.length; i++) {
						var spec = soundSpecsWaitingForInit[i];
						self.openSoundAsInitialised(spec.soundSpec, spec.onSuccess, spec.onFailure);
					}
				}, function() {
					/* init failed - notify all queued sound specs of failure */
					initFailed = true;
					for (var i = 0; i < soundSpecsWaitingForInit.length; i++) {
						soundSpecsWaitingForInit[i].onFailure();
					}
				});
			} else if (!initSucceeded && !initFailed) {
				/* waiting for init to complete */
				enqueueSoundSpecUntilInitCompleted();
			} else if (initSucceeded) {
				/* can open sound immediately */
				self.openSoundAsInitialised(soundSpec, onSuccess, onFailure);
			} else { /* initFailed */
				/* fail opening immediately */
				onFailure();
			}
		};
		
		/* subclasses override self.openSoundAsInitialised to perform the action of
			opening a sound once self.init has succeeded. */
		self.openSoundAsInitialised = function(soundSpec, onSuccess, onFailure) {
			/* default no-behaviour-implemented behaviour: immediately return failure */
			onFailure();
		};
		
		return self;
	}

	/* Abstract superclass for drivers that consider each source in turn until they
	find a suitable one that works */
	function SingleSourceDriver() {
		var self = BaseDriver();
		self.driverName = 'SingleSourceDriver';

		self.openSoundAsInitialised = function(soundSpec, onSuccess, onFailure) {
			var sourceIndex = 0;

			var trySource = function() {
				if (sourceIndex < soundSpec.sources.length) {
					self.openSoundFromSource(soundSpec, soundSpec.sources[sourceIndex], function(sound) {
						/* success */
						onSuccess(sound);
					}, function() {
						/* failure; try next source */
						sourceIndex++;
						trySource();
					});
				} else {
					/* no more sources to try */
					onFailure();
				}
			};

			trySource();
		};

		/* subclasses override self.openSoundFromSource to attempt opening a sound
			from the given source, and call onSuccess or onFailure as appropriate */
		self.openSoundFromSource = function(soundSpec, source, onSuccess, onFailure) {
			/* default no-behaviour-implemented behaviour: immediately return failure */
			onFailure();
		};

		return self;
	}

	function HtmlAudioDriver() {
		var self = BaseDriver();
		self.driverName = 'HtmlAudioDriver';
		
		var hasConfirmedLackOfSupport = false;
		
		self.openSoundAsInitialised = function(soundSpec, onSuccess, onFailure) {
			if (!hasHtmlAudio) {
				onFailure();
				return;
			}

			/* create a source element for each source that has a possibly-supported type */
			var sourceElems = [];
			for (var i = 0; i < soundSpec.sources.length; i++) {
				var source = soundSpec.sources[i];
				if (source.canPlayTypeNatively()) {
					sourceElems.push(
						createDOMElement('source', {'type': source.mimeType, 'src': source.url})
					);
				}
			}
			if (sourceElems.length === 0) {
				/* no supported sources; give up now */
				onFailure();
				return;
			}

			/* start by trying to create an audio element */
			var audioElem = createDOMElement('audio');
			for (i = 0; i < sourceElems.length; i++) {
				audioElem.appendChild(sourceElems[i]);
			}
			
			var hasReturned = false; /* ensure that we only call onSuccess/onFailure once, even if
				the relevant audio events are triggered multiple times for some reason */
			
			document.body.appendChild(audioElem);
			/* listen for an error on the last source element, which indicates that neither source was playable */
			sourceElems[sourceElems.length - 1].addEventListener('error', function() {
				if (!hasReturned) {
					hasReturned = true;
					onFailure();
				}
			}, false);
			if (soundSpec.volume) audioElem.volume = soundSpec.volume;
			
			/* listening for the 'canplaythrough' event would be more correct, but browsers are inconsistent about
				whether this actually gets fired */
			audioElem.addEventListener('loadedmetadata', function() {
				if (!hasReturned) {
					hasReturned = true;
					onSuccess({
						'play': function() {
							audioElem.currentTime = 0;
							audioElem.play();
						},
						'stop': function() {
							audioElem.pause();
						}
					});
				}
			}, false);
			
			audioElem.load();
		};
		
		return self;
	}
	
	function FlashMp3Driver() {
		var self = SingleSourceDriver();
		self.driverName = 'FlashMp3Driver';
		
		var flashElem;
		var successCallbacksBySoundId = {};
		
		self.init = function(onSuccess, onFailure) {
			var managerElement = createDOMElement('div', {'id': 'ample_mp3_manager', 'style': 'position: absolute; top: -100px;'});
			document.body.appendChild(managerElement);
			swfobject.embedSWF(Ample.swfPath, 'ample_mp3_manager',
				'16', '16', /* Flash movie dimensions */
				'9', /* minimum Flash version required */
				false, /* express install URL */
				false, /* flashvars */
				false, /* object params */
				{'style': 'position: absolute; top: -100px'}, /* object attributes */
				function(e) { /* oncomplete callback */
					if (e.success) {
						/* check every 100ms whether flash methods have appeared */
						var ping = function() {
							if (e.ref.openSound) {
								flashElem = e.ref;
								
								/* swf will call this whenever a sound has completed loading,
								passing in the sound ID */
								Ample.flashMp3DriverSoundLoaded = function(soundId) {
									successCallbacksBySoundId[soundId]({
										'play': function() {flashElem.playSound(soundId);},
										'stop': function() {flashElem.stopSound(soundId);}
									});
								};
								
								onSuccess();
							} else {
								setTimeout(ping, 100);
							}
						};
						ping();
					} else {
						onFailure();
					}
				}
			);
		};
		
		self.openSoundFromSource = function(soundSpec, source, onSuccess, onFailure) {
			if (source.typeIdentifier === 'mp3') {
				var soundId = flashElem.openSound(source.url, soundSpec.volume || 1);
				/* store the success callback to be called when the swf
				pings Ample.flashMp3DriverSoundLoaded */
				successCallbacksBySoundId[soundId] = onSuccess;
			} else {
				/* source is not mp3 - reject it */
				onFailure();
			}
		};
		
		return self;
	}
	
	function WebAudioDriver() {
		var self = SingleSourceDriver();
		self.driverName = 'WebAudioDriver';
		
		/* our audio context */
		var audio;
				
		self.init = function(onSuccess, onFailure) {
			if (window.webkitAudioContext) {
				// we need an audio context to work with..
				audio = new webkitAudioContext();
				onSuccess();
			} else {
				onFailure();
			}
		};
		
		self.openSoundFromSource = function(soundSpec, source, onSuccess, onFailure) {
			/* reject source immediately if it's not one that Audio.canPlayType claims it might to be able to play */
			if (!source.canPlayTypeNatively()) {
				onFailure();
				return;
			}

			source.getData(function(data) {
				/* successfully fetched data - proceed to decode */
				audio.decodeAudioData(data, function(decoded) {
				
					/* we now have decoded audio data */
					var source = null;
					onSuccess({
						'play': function() {
						
							/* we need to create a new buffer source every time the note is played */
							source = audio.createBufferSource();
							source.buffer = decoded;
												
							/* if volume has been specified, we need to route via an AudioGainNode */
							if(soundSpec.volume) {
								var gain = audio.createGainNode();
								source.connect(gain);
								gain.connect(audio.destination);
								gain.gain.volume = soundSpec.volume;
							} else {
								source.connect(audio.destination);
							}
							source.noteOn(0);
						},
						'stop': function() {
							source.noteOff(0);
						}
					});
					
				}, function(e) { onFailure(); });
			}, function() {
				/* failed to fetch data */
				onFailure();
			});
		};

		return self;
	}
	
	var Ample = {};
	
	var drivers = [WebAudioDriver()];

	if (navigator.userAgent.match(/Chrome/)) {
		/* Chrome is somewhat unstable with large numbers (>50) of HTML Audio tags; favour Flash over HTML audio */
		drivers = drivers.concat([FlashMp3Driver(), HtmlAudioDriver()]);
	} else {
		drivers = drivers.concat([HtmlAudioDriver(), FlashMp3Driver()]);
	}

	Ample.openSound = function(opts) {
		var soundSpec = {
			'sources': [],
			'volume': opts.volume
		};

		/* deprecated options - mp3Path and oggPath - superseded by 'sources' list */
		if (opts.mp3Path) {
			soundSpec.sources.push(Source('mp3', opts.mp3Path));
		}
		if (opts.oggPath) {
			soundSpec.sources.push(Source('ogg-vorbis', opts.oggPath));
		}
		if (opts.sources) {
			for (var typeId in opts.sources) {
				soundSpec.sources.push(Source(typeId, opts.sources[typeId]));
			}
		}

		var driverIndex = 0;
		function tryDriver() {
			drivers[driverIndex].openSound(soundSpec, function(sound) {
				/* success */
				if (opts.onSuccess) opts.onSuccess(sound);
			}, function() {
				/* failure; try next driver */
				driverIndex++;
				if (driverIndex < drivers.length) {
					tryDriver();
				} else {
					/* all drivers failed */
					if (opts.onFailure) opts.onFailure();
				}
			});
		}
		tryDriver();
	};
	
	window.Ample = Ample;
})();
