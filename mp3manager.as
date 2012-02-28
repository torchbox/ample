package{
	import flash.display.Sprite;
	import flash.media.*;
	import flash.net.URLRequest;
	import flash.external.ExternalInterface;
	import flash.events.Event;
	
	public class mp3manager extends Sprite{
		private var soundChannels:Array = [];
		private var sounds:Array = [];
		private var soundTransforms:Array = [];
		private var nextSoundIndex:int = 0;
		
		public function playSound(soundIndex:int):void {
			soundChannels[soundIndex] = sounds[soundIndex].play(0, 0, soundTransforms[soundIndex]);
		}
		public function stopSound(soundIndex:int):void {
			soundChannels[soundIndex].stop();
		}
		
		public function openSound(urlString:String, vol:Number):int {
			var urlReq:URLRequest = new URLRequest(urlString);
			var soundIndex:int = nextSoundIndex;
			sounds[soundIndex] = new Sound(urlReq);
			soundTransforms[soundIndex] = new SoundTransform(vol, 0);
			
			function soundLoadedHandler():void {
				ExternalInterface.call('Ample.flashMp3DriverSoundLoaded', soundIndex);
			}
			sounds[soundIndex].addEventListener(Event.COMPLETE, soundLoadedHandler);
			
			nextSoundIndex += 1;
			return soundIndex;
		}
		
		public function mp3manager() {
			ExternalInterface.addCallback('openSound', openSound);
			ExternalInterface.addCallback('playSound', playSound);
			ExternalInterface.addCallback('stopSound', stopSound);
		}
	}
}