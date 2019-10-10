import { Cursor, ObjectId } from 'mongodb';
import {
  Collection,
  Db,
  OptionalId,
  InsertOneWriteOpResult,
  CommonOptions,
  FilterQuery,
  UpdateQuery,
  UpdateManyOptions,
  UpdateOneOptions,
  ReplaceOneOptions,
  PropsOf,
  CollectionInsertOneOptions,
  InsertWriteOpResult,
  CollectionInsertManyOptions
} from '../types';
import { DocumentMetadata } from '../metadata/DocumentMetadata';
import { DocumentNotFound } from '../errors';
import { DocumentManager } from '../DocumentManager';
import {
  FindOneOptions,
  FindOneAndUpdateOption,
  FindOneAndReplaceOption,
  FindOneAndDeleteOption,
  UpdateWriteOpResult,
  ReplaceWriteOpResult,
  DeleteWriteOpResultObject
} from 'mongodb';

/**
 * Repository for documents
 */
export class Repository<T> {
  private _manager: DocumentManager;
  private _metadata: DocumentMetadata<T>;

  get manager(): DocumentManager {
    return this._manager;
  }

  set manager(manager: DocumentManager) {
    if (this._manager) {
      throw new Error('Cannot set DocumentManager for repository');
    }

    this._manager = manager;
  }

  get metadata(): DocumentMetadata<T> {
    return this._metadata;
  }

  set metadata(metadata: DocumentMetadata<T>) {
    if (this._metadata) {
      throw new Error('Cannot set DocumentMetadata for repository');
    }

    this._metadata = metadata;
  }

  /**
   * Gets the mongo database for the class.
   */
  get db(): Db {
    return this.metadata.db;
  }

  /**
   * Gets the mongo Collection for the class.
   */
  get collection(): Collection<T> {
    return this.metadata.collection;
  }

  init(props: PropsOf<OptionalId<T>>): T {
    return this.metadata.init(props);
  }

  toDB(model: T): PropsOf<T> {
    return this.metadata.toDB(model);
  }

  fromDB(doc: PropsOf<T>): T {
    return this.metadata.fromDB(doc);
  }

  // -------------------------------------------------------------------------
  // MongoDB specific methods
  // -------------------------------------------------------------------------

  /**
   * Creates the document id.
   */
  id(id?: string | ObjectId): ObjectId {
    return this.metadata.id(id);
  }

  find(query?: FilterQuery<T>): Cursor<T>;
  find(query: FilterQuery<T>, options?: FindOneOptions): Cursor<T>;
  find(query: FilterQuery<T>, opts?: FindOneOptions): Cursor<T> {
    const cursor = this.collection.find(query, opts);
    cursor.map((doc: any) => this.fromDB(doc));

    return cursor;
  }

  async findById(id: any): Promise<T | null> {
    return this.findOne({ _id: this.id(id) });
  }

  async findByIdOrFail(id: any): Promise<T> {
    return this.failIfEmpty(
      this.metadata,
      { _id: id },
      await this.findById(id)
    );
  }

  async findOne(
    filter: FilterQuery<T | any>,
    opts?: FindOneOptions
  ): Promise<T | null> {
    const found = await this.collection.findOne(filter, opts);

    return found ? this.fromDB(found) : null;
  }

  async findOneOrFail(
    filter: FilterQuery<T>,
    opts?: FindOneOptions
  ): Promise<T | null> {
    return this.failIfEmpty(
      this.metadata,
      filter,
      await this.findOne(filter, opts)
    );
  }

  create(
    props: OptionalId<PropsOf<T>>,
    opts?: CollectionInsertOneOptions
  ): Promise<T>;
  create(
    props: OptionalId<PropsOf<T>>[],
    opts?: CollectionInsertManyOptions
  ): Promise<T[]>;
  async create(
    props: OptionalId<PropsOf<T>> | OptionalId<PropsOf<T>>[],
    opts?: CollectionInsertOneOptions | CollectionInsertManyOptions
  ): Promise<T | T[]> {
    return Array.isArray(props)
      ? this.createMany(props, opts)
      : this.createOne(props, opts);
  }

  async createOne(
    props: OptionalId<PropsOf<T>>,
    opts?: CollectionInsertOneOptions
  ): Promise<T> {
    const model = this.init(props);

    const { result } = await this.insertOne(model, opts);

    return result && result.ok ? model : null;
  }

  async createMany(
    props: OptionalId<PropsOf<T>>[],
    opts?: CollectionInsertManyOptions
  ): Promise<T[]> {
    const models = props.map(p => this.init(p));
    const { insertedIds } = await this.insertMany(models, opts);

    return Object.keys(insertedIds).map(i => models[i]);
  }

  async insertOne(
    model: OptionalId<T>,
    opts?: CollectionInsertOneOptions
  ): Promise<InsertOneWriteOpResult> {
    return this.collection.insertOne(this.toDB(model as T), opts);
  }

  async insertMany(
    models: OptionalId<T>[],
    opts?: CollectionInsertManyOptions
  ): Promise<InsertWriteOpResult> {
    return this.collection.insertMany(
      models.map(model => this.toDB(model as T)),
      opts
    );
  }

  async findOneAndUpdate(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    opts: FindOneAndUpdateOption = {}
  ): Promise<T | null> {
    return this.findOneAnd('Update', filter, update, {
      returnOriginal: false,
      ...opts
    });
  }

  async findOneAndReplace(
    filter: FilterQuery<T>,
    props: OptionalId<PropsOf<T>>,
    opts?: FindOneAndReplaceOption
  ): Promise<T | null> {
    return this.findOneAnd('Replace', filter, props, {
      returnOriginal: false,
      ...opts
    });
  }

  async findOneAndDelete(
    filter: FilterQuery<T>,
    opts?: FindOneAndDeleteOption
  ): Promise<T | null> {
    return this.findOneAnd('Delete', filter, opts);
  }

  async updateOne(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    opts?: UpdateOneOptions
  ): Promise<UpdateWriteOpResult> {
    return this.collection.updateOne(filter, update, opts);
  }

  async updateMany(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    opts?: UpdateManyOptions
  ): Promise<UpdateWriteOpResult> {
    return this.collection.updateMany(filter, update, opts);
  }

  async replaceOne(
    filter: FilterQuery<T>,
    props: OptionalId<PropsOf<T>>,
    opts?: ReplaceOneOptions
  ): Promise<ReplaceWriteOpResult> {
    return this.collection.replaceOne(
      filter,
      this.toDB(this.init(props)),
      opts
    );
  }

  async deleteOne(
    filter: FilterQuery<T>,
    opts?: CommonOptions & { bypassDocumentValidation?: boolean }
  ): Promise<boolean> {
    const result = await this.collection.deleteOne(filter, opts);

    return result && result.deletedCount === 1;
  }

  async deleteMany(
    filter: FilterQuery<T>,
    opts?: CommonOptions
  ): Promise<DeleteWriteOpResultObject> {
    return this.collection.deleteMany(filter, opts);
  }

  // -------------------------------------------------------------------------
  // Protected Methods
  // -------------------------------------------------------------------------

  protected failIfEmpty(
    meta: DocumentMetadata<T>,
    filter: FilterQuery<any>,
    value: any
  ) {
    if (!value) {
      throw new DocumentNotFound(meta, filter);
    }

    return value;
  }

  protected async findOneAnd(
    op: 'Update' | 'Replace' | 'Delete',
    ...args: any
  ): Promise<T | null> {
    const result = await this.collection[`findOneAnd${op}`].apply(
      this.collection,
      args
    );

    return result && result.ok && result.value
      ? this.fromDB(result.value)
      : null;
  }
}
