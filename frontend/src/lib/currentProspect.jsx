import { createContext, useContext, useState } from 'react';

const Ctx = createContext([null, () => {}]);

export function CurrentProspectProvider({ children }) {
  const state = useState(null);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useCurrentProspect() {
  return useContext(Ctx);
}
