/**
 * Stops React from crashing when something outside React has rearranged the
 * DOM underneath it.
 *
 * Browser page translation (Chrome/Google Translate, Edge, Safari's built-in
 * translator) swaps every text node it translates for a <font> wrapper. React
 * still holds the original text node, so the next time it inserts a sibling
 * before it, or removes it, the browser throws:
 *
 *   Chrome:  NotFoundError: Failed to execute 'insertBefore' on 'Node': The node
 *            before which the new node is to be inserted is not a child of this node.
 *   Chrome:  NotFoundError: Failed to execute 'removeChild' on 'Node': ...
 *   Safari:  NotFoundError: The object can not be found here.
 *
 * and the whole route unmounts into the error boundary. Checkout is where this
 * bites hardest, because its buttons swap spinner/label content on every tap.
 *
 * Components should still wrap conditional text in an element (a <span>) so
 * React swaps elements rather than bare text nodes; this guard is the backstop
 * for the places we miss and for extensions that touch the DOM some other way.
 * When the node React expects is no longer where it left it, we degrade instead
 * of throwing: a removal of an already-moved node is a no-op, and an insert
 * before a moved node becomes an append. The page may be slightly out of order
 * until the next render, which beats a blank checkout.
 *
 * See https://github.com/facebook/react/issues/11538.
 */
export function guardForeignDomMutations(
  onMismatch?: (op: "removeChild" | "insertBefore") => void
): void {
  if (typeof Node !== "function" || !Node.prototype) return;
  const proto = Node.prototype as Node & { __foodoDomGuard?: boolean };
  if (proto.__foodoDomGuard) return;
  proto.__foodoDomGuard = true;

  const originalRemoveChild = proto.removeChild;
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      onMismatch?.("removeChild");
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = proto.insertBefore;
  proto.insertBefore = function <T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      onMismatch?.("insertBefore");
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
