import type { ZodTypeAny } from "zod";
import type { TaxNode } from "./tax-node.ts";
import type { FilerIdentity } from "../../forms/f1040/mef/header.ts";
import type { ExecuteResult } from "../runtime/executor.ts";
import type { MefBundle } from "../../forms/f1040/2025/mef/builder.ts";
import type { MefPdfAttachment } from "../../forms/f1040/2025/mef/form-descriptor.ts";
import type { DiagnosticsReport } from "../validation/types.ts";

export interface PreparedFormReturn {
  readonly bundle: MefBundle;
  readonly renderPdf: () => Promise<Uint8Array>;
}

export type InputNodeEntry =
  | {
    readonly node: TaxNode;
    readonly inputKey?: string;
    readonly itemSchema: ZodTypeAny;
    readonly isArray: true;
  }
  | {
    readonly node: TaxNode;
    readonly inputKey?: string;
    readonly inputSchema: ZodTypeAny;
    readonly isArray: false;
  };

interface FormDefinitionBase {
  readonly formType: string;
  readonly taxYear: number;
  readonly paperAvailable: boolean;
  readonly inputNodes: readonly InputNodeEntry[];
  readonly registry: Record<string, TaxNode>;
  /** Single form-owned execution entrypoint for validated source inputs. */
  readonly executeReturn: (inputs: Record<string, unknown>) => ExecuteResult;
  readonly buildPdfBytes: (
    pending: Record<string, unknown>,
    filer?: FilerIdentity,
    options?: { readonly draft?: boolean; readonly issues?: readonly PreparationIssue[] },
  ) => Promise<Uint8Array>;
  readonly buildPending: (
    pending: Record<string, unknown>,
  ) => Record<string, unknown>;
}

export interface PreparationIssue {
  readonly code: string;
  readonly message: string;
  readonly form: string;
}

export interface PaperFormDefinition extends FormDefinitionBase {
  readonly preparationMode: "paper";
  /** The public composite schema, restricted to this product's supported inputs. */
  readonly sourceSchema: ZodTypeAny;
  /** Inspect raw fields before parsing can discard unsupported historical facts. */
  readonly assertInput: (nodeType: string, data: unknown) => void;
  readonly preparationIssues: (
    inputs: Readonly<Record<string, unknown>>,
    pending: Readonly<Record<string, Record<string, unknown>>>,
  ) => readonly PreparationIssue[];
}

export interface MefFormDefinition extends FormDefinitionBase {
  readonly preparationMode: "mef";
  readonly mefSchemaVersion: string;
  /** Build linked native documents once and retain their printable source. */
  readonly prepareReturn: (
    pending: Record<string, unknown>,
    filer: FilerIdentity | undefined,
    attachments?: ReadonlyArray<MefPdfAttachment>,
    retainedSourceDocuments?: ReadonlyArray<
      { document_reference: string; bytes: Uint8Array }
    >,
  ) => Promise<PreparedFormReturn>;
  readonly buildMefXml: (
    pending: Record<string, unknown>,
    filer?: FilerIdentity,
  ) => string;
  /** A submission type with its own rule set; absent means the Form 1040 rules. */
  readonly mefRuleReport?: (
    pending: Readonly<Record<string, unknown>>,
    xml: string,
  ) => DiagnosticsReport;
}

export type FormDefinition = MefFormDefinition | PaperFormDefinition;
