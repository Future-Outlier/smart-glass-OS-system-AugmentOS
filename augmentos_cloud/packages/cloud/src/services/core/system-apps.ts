const systemApps = {
  captions: {
    host: "live-captions",
    packageName: "com.augmentos.livecaptions",
    name: "Live Captions",
    description: "Live closed captions.",
    isSystemApp: true,
  },
  flash: {
    host: "flash",
    packageName: 'org.augmentos.flash',
    name: 'Flash ⚡️',
    description: "⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️",
    isSystemApp: true,
  },
  dashboard: {
    host: "dashboard-manager",
    packageName: 'com.augmentos.dashboard',
    name: 'Dashboard',
    description: "Dashboard",
    isSystemApp: true,
  },
  notify: {
    host: "notify",
    packageName: 'com.augmentos.notify',
    name: 'Notify',
    description: "See your phone notifications on your smart glasses",
    isSystemApp: true,
  },
  mira: {
    host: "mira",
    packageName: 'com.augmentos.miraai',
    name: 'Mira AI',
    description: "The AugmentOS AI Assistant. Say 'Hey Mira...' followed by a question or command.",
    isSystemApp: true,
  },
  teleprompter: {
    host: `teleprompter`,
    packageName: 'com.augmentos.teleprompter',
    name: 'Teleprompter',
    description: "Teleprompter for live presentations.",
    isSystemApp: true,
  },
  liveTranslation: {
    host: "live-translation",
    packageName: 'com.augmentos.live-translation',
    name: 'Live Translation',
    description: "Live language translation.",
    isSystemApp: true,
  },
  merge: {
    host: process.env.MERGE_HOST_NAME || `merge`,
    packageName: 'com.mentra.merge',
    name: 'Merge',
    description: "Proactive AI that helps you during conversations. Turn it on, have a conversation, and let Merge agents enhance your convo.",
    isSystemApp: true,
    skipPorterHostUpdate: true,
  },
};

// Check if deployed on porter. if so we need to modify the hosts with the porter env prefix.
// seems like we gotta do: augmentos-cloud-dev-live-captions.default.svc.cluster.local:80
// aka <PORTER_APP_NAME>-<app.host>.default.svc.cluster.local:<app.port (default:80)>
// this is because porter doesn't support the use of the default host names the same way docker-compose does.
// The default host names are used for the system apps in the docker-compose file.
// In cloud environments i.e production, development, staging: the system apps are deployed as services in the porter cluster.

if (process.env.PORTER_APP_NAME) {
  for (const app of Object.values(systemApps)) {
    // if the app is already using the porter host, skip it

    // @ts-ignore
    if ((app as any).skipPorterHostUpdate) {
      console.log(`⚡️⚡️⚡️⚡️⚡️ Skipping porter host update for ${app.name} ||| HOST ||| (${app.host}) ⚡️⚡️⚡️⚡️⚡️`);
      continue;
    }

    app.host = `${process.env.PORTER_APP_NAME}-${app.host}.default.svc.cluster.local:${process.env.PORTER_APP_PORT || 80}`;
    console.log(`⚡️ System app ${app.name} host: ${app.host}`);
  }
}

export { systemApps };
export default systemApps;