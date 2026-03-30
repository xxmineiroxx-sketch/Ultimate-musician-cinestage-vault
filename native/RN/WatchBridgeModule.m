// WatchBridgeModule.m
// Objective-C bridge that exposes WatchBridgeModule.swift to React Native.
// Drop into ios/UltimatePlayback/ alongside WatchBridgeModule.swift.

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(WatchBridgeModule, RCTEventEmitter)

RCT_EXTERN_METHOD(sendMessage:(NSDictionary *)payload
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateApplicationContext:(NSDictionary *)payload
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isReachable:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
