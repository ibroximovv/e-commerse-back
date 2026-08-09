import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export abstract class BaseService<
  TModel,
  TCreateInput,
  TUpdateInput,
  TFindManyArgs = any,
> {
  constructor(
    protected readonly prisma: PrismaService,
    private readonly modelName: string,
  ) {}

  protected get modelDelegate() {
    return this.prisma[this.modelName.charAt(0).toLowerCase() + this.modelName.slice(1)];
  }

  async create(data: TCreateInput): Promise<TModel> {
    return this.modelDelegate.create({ data });
  }

  async findAll(args?: TFindManyArgs): Promise<TModel[]> {
    return this.modelDelegate.findMany(args);
  }

  async findOne(id: string): Promise<TModel> {
    const record = await this.modelDelegate.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException(`${this.modelName} with ID ${id} not found`);
    }
    return record;
  }

  async update(id: string, data: TUpdateInput): Promise<TModel> {
    await this.findOne(id); // Ensure exists
    return this.modelDelegate.update({
      where: { id },
      data,
    });
  }

  async remove(id: string): Promise<TModel> {
    await this.findOne(id); // Ensure exists
    return this.modelDelegate.delete({
      where: { id },
    });
  }
}
