export const PlanTiers = {
  LITE: 'LITE',
  PRO: 'PRO',
  ENTERPRISE: 'ENTERPRISE',
};

export function getEntitlements(tier) {
  switch (tier) {
    case PlanTiers.ENTERPRISE:
      return {
        maxStems: Infinity,
        controllerMapping: true,
        servicePlan: true,
        cineStage: true,
        lightingSync: true,
        deviceRoles: true,
        rehearsalMode: true,
        deviceSlots: 5,
      };
    case PlanTiers.PRO:
      return {
        maxStems: Infinity,
        controllerMapping: true,
        servicePlan: true,
        cineStage: true,
        lightingSync: true,
        deviceRoles: true,
        rehearsalMode: false,
        deviceSlots: 1,
      };
    case PlanTiers.LITE:
    default:
      return {
        maxStems: 4,
        controllerMapping: false,
        servicePlan: false,
        cineStage: false,
        lightingSync: false,
        deviceRoles: false,
        rehearsalMode: false,
        deviceSlots: 1,
      };
  }
}

