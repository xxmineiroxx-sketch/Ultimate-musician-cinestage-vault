/**
 * AudioEngineBridge.m
 *
 * Registers the Swift AudioEngineBridge class with the React Native bridge.
 * All method implementations live in AudioEngineBridge.swift.
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AudioEngineBridge, NSObject)

// Playback control
RCT_EXTERN_METHOD(load:(NSString *)uri)
RCT_EXTERN_METHOD(play)
RCT_EXTERN_METHOD(stop)

// Fades (duration in milliseconds)
RCT_EXTERN_METHOD(fadeIn:(nonnull NSNumber *)duration)
RCT_EXTERN_METHOD(fadeOut:(nonnull NSNumber *)duration)
RCT_EXTERN_METHOD(fadeTo:(nonnull NSNumber *)volume
                  duration:(nonnull NSNumber *)duration)

// Utility
RCT_EXTERN_METHOD(getVolume:(RCTResponseSenderBlock)callback)

@end
