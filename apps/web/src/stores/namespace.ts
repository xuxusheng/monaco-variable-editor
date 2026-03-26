export interface NamespaceState {
  currentNamespace: string | null;
  hasNamespaces: boolean;
}

export interface NamespaceActions {
  setCurrentNamespace: (id: string) => void;
  setHasNamespaces: (has: boolean) => void;
}

export const namespaceInitialState: NamespaceState = {
  currentNamespace: null,
  hasNamespaces: false,
};

export const createNamespaceActions = (
  set: (fn: (state: any) => void) => void,
): NamespaceActions => ({
  setCurrentNamespace: (id) =>
    set((state) => {
      state.currentNamespace = id;
    }),
  setHasNamespaces: (has) =>
    set((state) => {
      state.hasNamespaces = has;
    }),
});
