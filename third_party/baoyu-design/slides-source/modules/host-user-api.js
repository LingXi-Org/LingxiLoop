// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installHostUserApi(runtime2) {
  var reactx4, isNonemptyUserString;
  async function resolveUserMethod(name) {
    let value = await (0, runtime2.getOrLoadHostCapability)("user", (0, runtime2.capabilityHasMethod)(name));
    if (value !== null)
      return value[name].bind(value);
  }
  async function callValidatedUserMethod(name, validate) {
    let value = await resolveUserMethod(name);
    if (!value)
      return null;
    try {
      let value2 = await value();
      return validate(value2) ? value2 : null;
    } catch {
      return null;
    }
  }
  function currentUserId() {
    return callValidatedUserMethod("id", isNonemptyUserString);
  }
  async function currentUserCanEdit() {
    let value = await resolveUserMethod("canEdit");
    if (!value)
      return null;
    try {
      let value2 = await value();
      return value2 === !0 ? !0 : value2 === !1 ? !1 : null;
    } catch {
      return null;
    }
  }
  async function currentUserCan(capability) {
    let value = await resolveUserMethod("can");
    if (!value)
      return null;
    try {
      let value2 = await value(capability);
      return typeof value2 == "boolean" ? value2 : null;
    } catch {
      return null;
    }
  }
  async function currentUserIsOwner() {
    let method = await resolveUserMethod("isOwner");
    if (!method)
      return !1;
    try {
      return await method() === !0;
    } catch {
      return !1;
    }
  }
  async function userProfileRecords(userIds) {
    let entries = /* @__PURE__ */ new Map(), value = userIds.length > 0 ? await resolveUserMethod("profiles") : void 0;
    if (!value)
      return entries;
    let text = (field) => typeof field == "string" ? field : "";
    try {
      let value2 = await value(userIds);
      if (typeof value2 != "object" || value2 === null)
        return entries;
      for (let value3 of userIds) {
        let value4 = Object.hasOwn(value2, value3) ? value2[value3] : void 0;
        if (typeof value4 != "object" || value4 === null)
          continue;
        let { name, avatarUrl, color } = value4;
        entries.set(value3, {
          name: text(name),
          avatarUrl: text(avatarUrl),
          color: text(color)
        });
      }
    } catch {
    }
    return entries;
  }
  async function userProfiles(userIds) {
    let entries = /* @__PURE__ */ new Map();
    for (let [id, profile] of await userProfileRecords(userIds))
      profile.name !== "" && entries.set(id, profile.name);
    return entries;
  }
  async function currentUserCanEditAsync() {
    let value = await (0, runtime2.loadHostCapabilityWithTimeout)("user", (0, runtime2.capabilityHasMethod)("canEdit"));
    if (value === null)
      return null;
    try {
      let value2 = await value.canEdit.call(value);
      return value2 === !0 ? !0 : value2 === !1 ? !1 : null;
    } catch {
      return null;
    }
  }
  async function currentUserProfile() {
    let value = await (0, runtime2.getOrLoadHostCapability)("user", (0, runtime2.capabilityHasMethod)("me"));
    if (value === null)
      return null;
    try {
      let value2 = await value.me.call(value);
      return typeof value2 != "object" || value2 === null ? null : {
        name: typeof value2.name == "string" ? value2.name : "",
        color: typeof value2.color == "string" ? value2.color : ""
      };
    } catch {
      return null;
    }
  }
  return bindRuntimeValue(runtime2, "reactx4", () => reactx4, (value) => {
    reactx4 = value;
  }), bindRuntimeValue(runtime2, "resolveUserMethod", () => resolveUserMethod), bindRuntimeValue(runtime2, "callValidatedUserMethod", () => callValidatedUserMethod), bindRuntimeValue(runtime2, "isNonemptyUserString", () => isNonemptyUserString, (value) => {
    isNonemptyUserString = value;
  }), bindRuntimeValue(runtime2, "currentUserId", () => currentUserId), bindRuntimeValue(runtime2, "currentUserCanEdit", () => currentUserCanEdit), bindRuntimeValue(runtime2, "currentUserCan", () => currentUserCan), bindRuntimeValue(runtime2, "currentUserIsOwner", () => currentUserIsOwner), bindRuntimeValue(runtime2, "userProfileRecords", () => userProfileRecords), bindRuntimeValue(runtime2, "userProfiles", () => userProfiles), bindRuntimeValue(runtime2, "currentUserCanEditAsync", () => currentUserCanEditAsync), bindRuntimeValue(runtime2, "currentUserProfile", () => currentUserProfile), () => {
    (0, runtime2.initializeUiInputs210)(), reactx4 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), isNonemptyUserString = (value) => typeof value == "string" && value.length > 0;
  };
}
export {
  installHostUserApi
};
