// WidgetDataModule.m
// Objective-C bridge for WidgetDataModule.swift.
// Drop into ios/UltimatePlayback/ alongside WidgetDataModule.swift.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WidgetDataModule, NSObject)

RCT_EXTERN_METHOD(writeWidgetData:(NSString *)jsonString
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
