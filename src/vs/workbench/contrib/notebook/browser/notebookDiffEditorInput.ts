/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GroupIdentifier, IEditorInput, IResourceDiffEditorInput, isResourceDiffEditorInput, IUntypedEditorInput, UntypedEditorContext } from 'vs/workbench/common/editor';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { URI } from 'vs/base/common/uri';
import { isEqual } from 'vs/base/common/resources';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotebookDiffEditorModel, IResolvedNotebookEditorModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IFileService } from 'vs/platform/files/common/files';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { ILabelService } from 'vs/platform/label/common/label';

class NotebookDiffEditorModel extends EditorModel implements INotebookDiffEditorModel {
	constructor(
		readonly original: IResolvedNotebookEditorModel,
		readonly modified: IResolvedNotebookEditorModel,
	) {
		super();
	}
}

export class NotebookDiffEditorInput extends DiffEditorInput {
	static create(instantiationService: IInstantiationService, resource: URI, name: string | undefined, description: string | undefined, originalResource: URI, viewType: string) {
		const original = NotebookEditorInput.create(instantiationService, originalResource, viewType);
		const modified = NotebookEditorInput.create(instantiationService, resource, viewType);
		return instantiationService.createInstance(NotebookDiffEditorInput, name, description, original, modified, viewType);
	}

	static override readonly ID: string = 'workbench.input.diffNotebookInput';

	private _modifiedTextModel: IResolvedNotebookEditorModel | null = null;
	private _originalTextModel: IResolvedNotebookEditorModel | null = null;

	override get resource() {
		return this.modified.resource;
	}

	override get editorId() {
		return this.viewType;
	}

	private _cachedModel: NotebookDiffEditorModel | undefined = undefined;

	constructor(
		name: string | undefined,
		description: string | undefined,
		override readonly original: NotebookEditorInput,
		override readonly modified: NotebookEditorInput,
		public readonly viewType: string,
		@IFileService fileService: IFileService,
		@ILabelService labelService: ILabelService,
	) {
		super(
			name,
			description,
			original,
			modified,
			undefined,
			labelService,
			fileService
		);
	}

	override get typeId(): string {
		return NotebookDiffEditorInput.ID;
	}

	override async resolve(): Promise<NotebookDiffEditorModel> {
		const [originalEditorModel, modifiedEditorModel] = await Promise.all([
			this.original.resolve(),
			this.modified.resolve(),
		]);

		this._cachedModel?.dispose();

		// TODO@rebornix check how we restore the editor in text diff editor
		if (!modifiedEditorModel) {
			throw new Error(`Fail to resolve modified editor model for resource ${this.modified.resource} with notebookType ${this.viewType}`);
		}

		if (!originalEditorModel) {
			throw new Error(`Fail to resolve original editor model for resource ${this.original.resource} with notebookType ${this.viewType}`);
		}

		this._originalTextModel = originalEditorModel;
		this._modifiedTextModel = modifiedEditorModel;
		this._cachedModel = new NotebookDiffEditorModel(this._originalTextModel, this._modifiedTextModel);
		return this._cachedModel;
	}

	override toUntyped(group: GroupIdentifier | undefined, context: UntypedEditorContext): IResourceDiffEditorInput {
		return {
			original: { resource: this.original.resource },
			modified: { resource: this.resource },
			options: {
				override: this.viewType
			}
		};
	}

	override matches(otherInput: IEditorInput | IUntypedEditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		if (isResourceDiffEditorInput(otherInput)) {
			return this.primary.matches(otherInput.modified) && this.secondary.matches(otherInput.original) && this.editorId !== undefined && this.editorId === otherInput.options?.override;
		}

		if (otherInput instanceof NotebookDiffEditorInput) {
			return this.viewType === otherInput.viewType
				&& isEqual(this.resource, otherInput.resource);
		}
		return false;
	}

	override dispose() {
		this._modifiedTextModel?.dispose();
		this._modifiedTextModel = null;
		this._originalTextModel?.dispose();
		this._originalTextModel = null;
		super.dispose();
	}
}
