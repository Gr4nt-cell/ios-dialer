// Adds the intent filters Android requires before it will offer this app
// as the default phone app (DIAL with and without a tel: number).
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

function hasFilter(filters, action, scheme) {
  return filters.some((f) => {
    const actions = (f.action || []).map((a) => a.$['android:name']);
    if (!actions.includes(action)) return false;
    const schemes = (f.data || []).map((d) => d.$['android:scheme']);
    return scheme ? schemes.includes(scheme) : schemes.length === 0;
  });
}

function addFilter(filters, action, scheme) {
  if (hasFilter(filters, action, scheme)) return;
  const filter = {
    action: [{ $: { 'android:name': action } }],
    category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
  };
  if (scheme) {
    filter.category.push({ $: { 'android:name': 'android.intent.category.BROWSABLE' } });
    filter.data = [{ $: { 'android:scheme': scheme } }];
  }
  filters.push(filter);
}

module.exports = function withDefaultDialer(config) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity['intent-filter'] = activity['intent-filter'] || [];
    const filters = activity['intent-filter'];
    addFilter(filters, 'android.intent.action.DIAL');
    addFilter(filters, 'android.intent.action.DIAL', 'tel');
    addFilter(filters, 'android.intent.action.VIEW', 'tel');
    addFilter(filters, 'android.intent.action.CALL_BUTTON');
    activity.$['android:launchMode'] = 'singleTask';
    return cfg;
  });
};
