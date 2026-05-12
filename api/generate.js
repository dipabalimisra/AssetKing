const appPromise = import("../server/app.js");

export default async function handler(req, res) {
  const { default: app } = await appPromise;
  // If app is an Express instance, it can handle (req, res)
  return app(req, res);
}
