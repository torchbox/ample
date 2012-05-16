ample
=====

ample is a Javascript library for playing audio clips, designed to take care of selecting the most appropriate audio
backend (HTML5 audio or Flash; .mp3 or .ogg) out of what's supported by the current browser, and present a common
interface for opening and playing samples regardless of backend.

Why not SoundManager2?
----------------------

Because that doesn't let you specify .ogg and .mp3 alternatives for the same clip, meaning that Firefox users without
Flash are out of luck.

Setup
-----

ample requires SWFObject 2.2 - ensure that this is included in your HTML header along with ample.js:

    <script src="/static/js/swfobject.js"></script>
    <script src="/static/js/ample.js"></script>

Additionally, it relies on a small .swf file (mp3manager.swf) for the Flash backend; specify the path to this file by
setting the variable Ample.swfPath:

    <script>
      Ample.swfPath = '/static/swf/mp3manager.swf';
    </script>

Usage
-----

To load an audio clip, call Ample.openSound:

    Ample.openSound({
        'oggPath':'/static/audio/rickroll.ogg',
        'mp3Path':'/static/audio/rickroll.mp3',
        'volume': 0.5,
        'onSuccess': function(sample) { alert('Sample is ready for use'); },
        'onFailure': function() { alert('oh no!'); }
    });

oggPath and mp3Path must both be supplied (and should point to instances of the same audio clip encoded as Ogg Vorbis
and MP3 respectively). The openSound method runs asynchronously (control returns to the code following the openSound
call without necessarily having completed its task); on completion, it calls the onSuccess or onFailure callback as
appropriate. onFailure indicates that none of the backends were able to load the clip (possibly because the file is
broken, or the browser does not support any of the audio output methods.

The onSuccess callback is passed a 'sample' object, with two methods: 'play' (which plays the clip from the beginning)
and 'stop' (which immediately stops playback).

Author
------

Matt Westcott <matt@west.co.tt>