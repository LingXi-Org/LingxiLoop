/** DOM state-preserving moves (feature checked before the upstream retained plane uses them). */
interface Element { moveBefore(movedNode: Node, referenceNode: Node | null): void }
